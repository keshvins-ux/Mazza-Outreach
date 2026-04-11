// api/prospects.js
// OCC — Prospects, CRM, and Document Data
//
// SQL Account data (SO, DO, INV, RV) → reads from Postgres, normalised to Redis field names
// OCC-native data (prospects, deals, po_intake, bom) → reads from Redis

import { createClient } from 'redis';
import { Pool } from 'pg';

const PROSPECTS_KEY = 'mazza_prospects';
const DEALS_KEY     = 'mazza_deals';

// ── REDIS ─────────────────────────────────────────────────────
async function getRedisClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return client;
}

// ── POSTGRES ──────────────────────────────────────────────────
let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return _pool;
}
async function q(sql, params = []) {
  const client = await getPool().connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

// ── STATUS NORMALISATION ──────────────────────────────────────
// Postgres stores status as SMALLINT. Frontend expects strings.
// SO/DO:      0 = Active, -10 = Cancelled (but cancelled=true is authoritative)
// Invoice:    SQL Account marks paid via receipt voucher offset — no direct status field
// We derive invoice status from outstanding amount (computed at sync time via sql_raw).

function normaliseSoStatus(row) {
  if (row.cancelled) return 'Cancelled';
  const note = (row.docref3 || '').toUpperCase().trim();
  if (note === 'DONE' || note.startsWith('DONE')) return 'Done';
  return 'Active';
}

function normaliseInvStatus(row) {
  // SQL Account invoice outstanding is stored in sql_raw — we don't sync it separately.
  // Return "Invoiced" as default; the sync can be enhanced later to derive Paid/Overdue.
  if (row.cancelled) return 'Cancelled';
  return 'Invoiced';
}

// ── POSTGRES QUERIES ──────────────────────────────────────────

async function getSalesOrders() {
  const r = await q(`
    SELECT
      so.dockey,
      so.docno,
      so.docdate::text                  AS docdate,
      so.code                           AS customercode,
      so.companyname,
      so.docamt::numeric                AS docamt,
      so.status,
      so.cancelled,
      so.docref1,
      so.docref2,
      so.docref3,
      so.agent,
      so.occ_synced_at,
      COALESCE(
        json_agg(
          json_build_object(
            'dtlkey',      sol.dtlkey,
            'itemcode',    sol.itemcode,
            'description', sol.description,
            'qty',         sol.qty::numeric,
            'offsetqty',   sol.offsetqty::numeric,
            'balance',     GREATEST(0, sol.qty::numeric - sol.offsetqty::numeric),
            'unitprice',   sol.unitprice::numeric,
            'amount',      sol.amount::numeric,
            'uom',         sol.uom,
            'deliverydate', sol.deliverydate::text
          ) ORDER BY sol.seq
        ) FILTER (WHERE sol.dtlkey IS NOT NULL),
        '[]'
      ) AS lines
    FROM sql_salesorders so
    LEFT JOIN sql_so_lines sol ON sol.dockey = so.dockey
    WHERE so.cancelled = false
      AND (so.docref3 IS NULL OR UPPER(TRIM(so.docref3)) != 'DONE')
    GROUP BY
      so.dockey, so.docno, so.docdate, so.code, so.companyname,
      so.docamt, so.status, so.cancelled, so.docref1, so.docref2,
      so.docref3, so.agent, so.occ_synced_at
    ORDER BY so.docdate DESC, so.dockey DESC
  `);

  // Normalise to the field names the frontend (App.js) has always used
  return r.rows.map(row => ({
    dockey:       row.dockey,
    id:           row.docno,           // s.id
    docNo:        row.docno,           // s.docNo
    date:         row.docdate ? row.docdate.slice(0,10) : null,  // s.date
    customer:     row.companyname,     // s.customer
    companyname:  row.companyname,
    customerCode: row.customercode,    // s.customerCode
    amount:       parseFloat(row.docamt) || 0,   // s.amount
    status:       normaliseSoStatus(row),         // s.status (string)
    statusRaw:    row.status,
    cancelled:    row.cancelled,
    poRef:        row.docref1 || null,            // s.poRef
    delivery:     row.docref2 || null,            // s.delivery
    deliveryDateRef: row.docref2 || null,         // s.deliveryDateRef
    statusNote:   row.docref3 || null,            // s.statusNote
    agent:        row.agent || null,              // s.agent
    lastModified: row.occ_synced_at ? new Date(row.occ_synced_at).getTime() / 1000 : null,
    lines:        row.lines || [],
  }));
}

async function getSalesInvoices() {
  const r = await q(`
    SELECT
      dockey,
      docno,
      docdate::text AS docdate,
      code          AS customercode,
      companyname,
      docamt::numeric AS docamt,
      status,
      cancelled,
      docref1,
      docref2,
      terms,
      occ_synced_at
    FROM sql_salesinvoices
    WHERE cancelled = false
    ORDER BY docdate DESC, dockey DESC
    LIMIT 500
  `);

  return r.rows.map(row => ({
    dockey:      row.dockey,
    id:          row.docno,                        // iv.id
    date:        row.docdate ? row.docdate.slice(0,10) : null,  // iv.date
    customer:    row.companyname,                  // iv.customer
    code:        row.customercode,                 // iv.code
    amount:      parseFloat(row.docamt) || 0,      // iv.amount
    outstanding: 0,                                // iv.outstanding — 0 until we sync this field
    dueDate:     null,                             // iv.dueDate — null until we compute from terms
    status:      normaliseInvStatus(row),          // iv.status (string)
    cancelled:   row.cancelled,
    soRef:       row.docref1 || null,              // iv.soRef — Document Tracker cross-ref
    terms:       row.terms,
    lastSynced:  row.occ_synced_at,
  }));
}

async function getDeliveryOrders() {
  const r = await q(`
    SELECT
      dockey,
      docno,
      docdate::text AS docdate,
      code          AS customercode,
      companyname,
      docamt::numeric AS docamt,
      status,
      cancelled,
      docref1,
      docref2,
      occ_synced_at
    FROM sql_deliveryorders
    WHERE cancelled = false
    ORDER BY docdate DESC, dockey DESC
    LIMIT 500
  `);

  return r.rows.map(row => ({
    dockey:      row.dockey,
    id:          row.docno,             // d.id
    date:        row.docdate ? row.docdate.slice(0,10) : null,
    customer:    row.companyname,       // d.customer
    code:        row.customercode,
    amount:      parseFloat(row.docamt) || 0,
    cancelled:   row.cancelled,
    soRef:       row.docref1 || null,   // d.soRef — CRITICAL for Document Tracker
    lastSynced:  row.occ_synced_at,
  }));
}

async function getReceiptVouchers() {
  const r = await q(`
    SELECT
      dockey,
      docno,
      docdate::text AS docdate,
      companyname,
      description,
      docamt::numeric AS docamt,
      paymentmethod,
      status,
      cancelled,
      gltransid,
      occ_synced_at
    FROM sql_receiptvouchers
    WHERE cancelled = false
    ORDER BY docdate DESC, dockey DESC
    LIMIT 500
  `);

  return r.rows.map(row => ({
    dockey:        row.dockey,
    id:            row.docno,            // rv.id
    date:          row.docdate ? row.docdate.slice(0,10) : null,
    customer:      row.companyname || row.description,  // rv.customer
    description:   row.description,
    amount:        parseFloat(row.docamt) || 0,          // rv.amount
    paymentmethod: row.paymentmethod,
    cancelled:     row.cancelled,
    gltransid:     row.gltransid,
    lastSynced:    row.occ_synced_at,
  }));
}

async function getCustomers() {
  const r = await q(`
    SELECT
      code,
      companyname,
      creditterm,
      creditlimit::numeric AS creditlimit,
      outstanding::numeric AS outstanding,
      status,
      area,
      synced_at AS lastSynced
    FROM sql_customers
    ORDER BY companyname
  `);
  return r.rows.map(row => ({
    code:        row.code,
    name:        row.companyname,        // frontend uses c.name in some places
    companyname: row.companyname,
    creditterm:  row.creditterm,
    creditlimit: parseFloat(row.creditlimit) || 0,
    outstanding: parseFloat(row.outstanding) || 0,
    status:      row.status,
    area:        row.area,
    lastSynced:  row.lastsynced,
  }));
}

async function getStockItems() {
  const r = await q(`
    SELECT
      code,
      description,
      stockgroup,
      defuom_st AS uom_code,
      isactive,
      balsqty::numeric AS balsqty,
      synced_at AS lastSynced
    FROM sql_stockitems
    ORDER BY code
  `);
  return r.rows.map(row => ({
    code:        row.code,
    description: row.description,
    name:        row.description,     // frontend uses s.name in some places
    stockgroup:  row.stockgroup,
    uom_code:    row.uom_code,
    isactive:    row.isactive,
    balsqty:     parseFloat(row.balsqty) || 0,
    lastSynced:  row.lastsynced,
  }));
}

async function getSyncStatus() {
  const r = await q(`
    SELECT sync_type, status, completed_at, records_fetched, records_upserted
    FROM occ_sync_log
    WHERE id IN (
      SELECT MAX(id) FROM occ_sync_log GROUP BY sync_type
    )
    ORDER BY sync_type
  `);
  return r.rows;
}

// ── MAIN HANDLER ──────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const type = req.query?.type;

  if (req.method === 'GET') {

    // ── SO + Invoice + DO + RV — Postgres ────────────────────
    if (type === 'so') {
      try {
        const [soList, ivList, doList, rvList, syncStatus] = await Promise.all([
          getSalesOrders(),
          getSalesInvoices(),
          getDeliveryOrders(),
          getReceiptVouchers(),
          getSyncStatus(),
        ]);
        const soSync  = syncStatus.find(s => s.sync_type === 'SALESORDERS');
        const updated = soSync?.completed_at?.toISOString() ?? new Date().toISOString();
        return res.status(200).json({
          so:      soList,
          invoice: ivList,
          dos:     doList,
          rv:      rvList,
          updated,
          source:  'postgres',
        });
      } catch(e) {
        console.error('prospects so error:', e.message);
        const client = await getRedisClient();
        try {
          const [soRaw, ivRaw, doRaw, rvRaw, updatedRaw] = await Promise.all([
            client.get('mazza_so'),
            client.get('mazza_invoice'),
            client.get('mazza_do'),
            client.get('mazza_rv'),
            client.get('mazza_so_updated'),
          ]);
          return res.status(200).json({
            so:      soRaw  ? JSON.parse(soRaw)  : [],
            invoice: ivRaw  ? JSON.parse(ivRaw)  : [],
            dos:     doRaw  ? JSON.parse(doRaw)  : [],
            rv:      rvRaw  ? JSON.parse(rvRaw)  : [],
            updated: updatedRaw || null,
            source:  'redis_fallback',
          });
        } finally { await client.disconnect(); }
      }
    }

    // ── Master data — Postgres ────────────────────────────────
    if (type === 'master') {
      try {
        const [customers, stockitems] = await Promise.all([
          getCustomers(),
          getStockItems(),
        ]);
        return res.status(200).json({ customers, stockitems, source: 'postgres' });
      } catch(e) {
        console.error('prospects master error:', e.message);
        const client = await getRedisClient();
        try {
          const [custRaw, itemsRaw] = await Promise.all([
            client.get('mazza_customers'),
            client.get('mazza_stockitems'),
          ]);
          return res.status(200).json({
            customers:  custRaw  ? JSON.parse(custRaw)  : [],
            stockitems: itemsRaw ? JSON.parse(itemsRaw) : [],
            source: 'redis_fallback',
          });
        } finally { await client.disconnect(); }
      }
    }

    // ── Redis-only routes (OCC-native data) ──────────────────
    const client = await getRedisClient();
    try {

      if (type === 'deals') {
        const data = await client.get(DEALS_KEY);
        return res.status(200).json({ deals: data ? JSON.parse(data) : [] });
      }

      if (type === 'so_legacy') {
        const [so, invoice, rv, po, catmap, updated] = await Promise.all([
          client.get('mazza_so'),
          client.get('mazza_invoice'),
          client.get('mazza_rv'),
          client.get('mazza_po'),
          client.get('mazza_catmap'),
          client.get('mazza_so_updated'),
        ]);
        return res.status(200).json({
          so:      so      ? JSON.parse(so)      : [],
          invoice: invoice ? JSON.parse(invoice) : [],
          rv:      rv      ? JSON.parse(rv)      : [],
          po:      po      ? JSON.parse(po)      : [],
          catmap:  catmap  ? JSON.parse(catmap)  : { spices:0, oil:0, flour:0, rawmat:0 },
          updated: updated || null,
        });
      }

      if (type === 'trigger_master_sync') {
        try {
          const syncUrl = process.env.VERCEL_URL
            ? `https://${process.env.VERCEL_URL}/api/sync-master`
            : 'http://localhost:3000/api/sync-master';
          const r = await fetch(syncUrl, { method: 'GET' });
          const d = await r.json();
          return res.status(200).json(d);
        } catch(e) {
          return res.status(500).json({ error: e.message });
        }
      }

      if (type === 'po_intake_list') {
        const data = await client.get('mazza_po_intake');
        return res.status(200).json({ list: data ? JSON.parse(data) : [] });
      }

      if (type === 'po_list') {
        const raw = await client.get('mazza_po');
        const pos = raw ? JSON.parse(raw) : [];
        function poStatus(p) {
          const s = p.status;
          if (s === 1   || s === 'Complete' || s === 'Closed') return { label:'Complete', pct:100 };
          if (s === -10 || s === 'Cancelled' || p.cancelled)   return { label:'Cancelled', pct:100 };
          if (s === -1  || s === 'Partial')                    return { label:'Partial', pct:50 };
          return { label:'Open', pct:0 };
        }
        return res.status(200).json({ pos: pos.map(p => {
          const st = poStatus(p);
          return {
            id:           p.id,
            supplier:     p.supplier,
            date:         p.date,
            amount:       p.amount,
            status:       st.label,
            cancelled:    p.cancelled || p.status === -10,
            deliveryDate: p.delivery || null,
            itemCount:    p.itemCount || null,
            offsetPct:    st.pct,
          };
        })});
      }

      if (type === 'pv_list') {
        const raw = await client.get('mazza_pv');
        const pvs = raw ? JSON.parse(raw) : [];
        if (!pvs.length) {
          const rvRaw = await client.get('mazza_rv');
          const rvs = rvRaw ? JSON.parse(rvRaw) : [];
          return res.status(200).json({ pvs: rvs.map(r => ({
            id: r.id, description: r.customer, date: r.date, amount: r.amount,
            paymentMethod: '—', journal: '—', cancelled: false,
          }))});
        }
        return res.status(200).json({ pvs });
      }

      if (type === 'grn_history') {
        const raw = await client.get('mazza_grn_history');
        return res.status(200).json({ list: raw ? JSON.parse(raw) : [] });
      }

      if (type === 'pending_grns') {
        const raw = await client.get('mazza_grn_pending');
        const all = raw ? JSON.parse(raw) : [];
        return res.status(200).json({ grns: all.filter(g => !g.approved) });
      }

      if (type === 'bom') {
        const data = await client.get('mazza_bom');
        return res.status(200).json({ bom: data ? JSON.parse(data) : {} });
      }

      if (type === 'demand') {
        const [dos, po, updated] = await Promise.all([
          client.get('mazza_do'),
          client.get('mazza_po'),
          client.get('mazza_so_updated'),
        ]);
        return res.status(200).json({
          dos:     dos ? JSON.parse(dos) : [],
          pos:     po  ? JSON.parse(po)  : [],
          updated: updated || null,
        });
      }

      // Default — prospects
      const data = await client.get(PROSPECTS_KEY);
      return res.status(200).json({ prospects: data ? JSON.parse(data) : null });

    } finally {
      await client.disconnect();
    }
  }

  // ── POST — Redis only (OCC-native writes) ────────────────────
  if (req.method === 'POST') {
    const client = await getRedisClient();
    try {
      const { prospects, deals, po } = req.body;
      if (po !== undefined) {
        const existing = await client.get('mazza_po_intake');
        const list = existing ? JSON.parse(existing) : [];
        list.unshift(po);
        await client.set('mazza_po_intake', JSON.stringify(list.slice(0, 200)));
        return res.status(200).json({ success: true, id: po.id });
      }
      if (deals !== undefined) {
        await client.set(DEALS_KEY, JSON.stringify(deals));
        return res.status(200).json({ success: true });
      }
      if (!prospects || !Array.isArray(prospects)) {
        return res.status(400).json({ error: 'Invalid data' });
      }
      await client.set(PROSPECTS_KEY, JSON.stringify(prospects));
      return res.status(200).json({ success: true });
    } finally {
      await client.disconnect();
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
