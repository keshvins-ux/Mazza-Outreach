// api/operations.js
// OCC — Operations API (Production, Gap Analysis, Purchase List)
//
// FIXED: Builds so:by_product equivalent from Postgres sql_salesorders + sql_so_lines
// FIXED: Reads stock balance from sql_stockitems.balsqty instead of Redis mazza_stock_balance
// FIXED: Reads invoices + DOs from Postgres instead of Redis
// KEPT:  Reads mazza_po_intake and mazza_bom from Redis (OCC-native data)

import { createClient } from 'redis';
import { Pool } from 'pg';

let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return _pool;
}
async function pgQuery(sql, params = []) {
  const c = await getPool().connect();
  try { return await c.query(sql, params); }
  finally { c.release(); }
}

// -- Shared helpers ------------------------------------------------------------

function isDone(status) {
  if (!status) return false;
  const s = status.toUpperCase().trim();
  return s.startsWith('DONE') || s.startsWith('CANCEL');
}

const CODE_MAP = { 'AP-MCP-001':'MCP-002', 'TP-96':'TP-001', 'CP-055':'CP-002' };
const UOM_MULT = {
  'MCP-002':{CTN:10,UNIT:1},'CP-002':{CTN:10,UNIT:1},'TP-001':{CTN:10,UNIT:1},
  'CRP-001':{CTN:10,UNIT:1},'CMP-001':{CTN:10,UNIT:1},'FCP-002':{CTN:10,UNIT:1},
  'CF-002':{CTN:10,CARTON:10,UNIT:1},'MCP-003':{CARTON:40,UNIT:1},'FCP-003':{CARTON:40,UNIT:1},
  'TP-003':{CARTON:80,UNIT:1},'CP-004':{CARTON:80,UNIT:1},'MCP-005':{CTN:2,CARTON:2,UNIT:1},
};

function getMultiplier(itemCode, uom) {
  const map = UOM_MULT[itemCode];
  if (!map) return 1;
  return map[(uom||'UNIT').toUpperCase()] ?? 1;
}

function explodeBOM(fgNeeded, bom) {
  const rmNeeded = {};
  Object.entries(fgNeeded).forEach(([fgCode, fg]) => {
    const bomEntry = bom[fgCode];
    if (!bomEntry) return;
    const mult = getMultiplier(fgCode, fg.uom);
    const bomUnits = fg.qty * mult;
    bomEntry.components.forEach(comp => {
      const needed = comp.qty * bomUnits;
      if (!rmNeeded[comp.code]) rmNeeded[comp.code] = { code:comp.code, uom:comp.uom, needed:0, refCost:comp.refCost||0, usedIn:[] };
      rmNeeded[comp.code].needed += needed;
      if (!rmNeeded[comp.code].usedIn.includes(fgCode)) rmNeeded[comp.code].usedIn.push(fgCode);
    });
  });
  return rmNeeded;
}

// -- Build so:by_product from Postgres ----------------------------------------

async function buildByProductFromPostgres() {
  const r = await pgQuery(`
    SELECT
      so.docno,
      so.docdate::text AS docdate,
      so.companyname   AS customer,
      so.code          AS customercode,
      so.docref3,
      so.cancelled,
      sol.itemcode,
      sol.description,
      sol.qty::numeric        AS qty,
      sol.offsetqty::numeric  AS offsetqty,
      sol.unitprice::numeric  AS unitprice,
      sol.amount::numeric     AS amount,
      sol.uom,
      sol.deliverydate::text  AS deliverydate
    FROM sql_salesorders so
    JOIN sql_so_lines sol ON sol.dockey = so.dockey
    WHERE so.cancelled = false
      AND (so.docref3 IS NULL OR UPPER(TRIM(so.docref3)) NOT LIKE 'DONE%')
      AND sol.itemcode IS NOT NULL
    ORDER BY so.docdate DESC
  `);

  const byProduct = {};
  for (const row of r.rows) {
    const itemCode = row.itemcode;
    const qty      = parseFloat(row.qty || 0);
    const offset   = parseFloat(row.offsetqty || 0);
    const balance  = Math.max(0, qty - offset);
    if (balance <= 0) continue;

    const unitPrice = parseFloat(row.unitprice || 0);
    const amount    = parseFloat(row.amount || 0);
    const uom       = row.uom || 'UNIT';
    const desc      = row.description || itemCode;
    const delDate   = row.deliverydate ? row.deliverydate.slice(0, 10) : null;

    if (!byProduct[itemCode]) {
      byProduct[itemCode] = {
        itemCode,
        description: desc,
        uom,
        unitPrice,
        totalQty: 0,
        totalValue: 0,
        orders: [],
      };
    }
    byProduct[itemCode].totalQty   += balance;
    byProduct[itemCode].totalValue += (balance / Math.max(qty, 1)) * amount;
    byProduct[itemCode].orders.push({
      soNo: row.docno,
      customer: row.customer,
      qty: balance,
      unitPrice,
      uom,
      date: row.docdate ? row.docdate.slice(0, 10) : null,
      deliveryDate: delDate,
      status: 'Active',
    });
  }
  return byProduct;
}

// -- Build stock balance map from Postgres ------------------------------------

async function buildStockFromPostgres() {
  const r = await pgQuery(`
    SELECT code, description, balsqty, stockgroup, defuom_st AS uom, synced_at
    FROM sql_stockitems
    WHERE code IS NOT NULL
  `);
  const stock = {};
  let updatedAt = null;
  for (const row of r.rows) {
    stock[row.code] = {
      code: row.code,
      description: row.description,
      balance: parseFloat(row.balsqty || 0),
      group: row.stockgroup,
      uom: row.uom || 'UNIT',
    };
    if (row.synced_at && (!updatedAt || row.synced_at > updatedAt)) {
      updatedAt = row.synced_at;
    }
  }
  return { stock, updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null };
}

// -- DOs + Invoices from Postgres ---------------------------------------------

async function getDOsFromPostgres() {
  const r = await pgQuery(`
    SELECT docno, companyname AS customer, docdate::text AS docdate, docref1, docref2
    FROM sql_deliveryorders WHERE cancelled = false ORDER BY docdate DESC
  `);
  return r.rows.map(d => ({
    id: d.docno, customer: d.customer,
    date: d.docdate ? d.docdate.slice(0, 10) : null,
    soRef: d.docref1 || d.docref2 || null,
  }));
}

async function getInvoicesFromPostgres() {
  const r = await pgQuery(`
    SELECT docno, companyname AS customer, code AS customercode,
           docamt::numeric AS docamt, docdate::text AS docdate
    FROM sql_salesinvoices WHERE cancelled = false ORDER BY docdate DESC
  `);
  return r.rows.map(iv => ({
    id: iv.docno, customer: iv.customer, code: iv.customercode,
    amount: parseFloat(iv.docamt) || 0,
    date: iv.docdate ? iv.docdate.slice(0, 10) : null,
  }));
}

// -- getActiveFG ---------------------------------------------------------------

function getActiveFG(snap, intake, liveStatus, fulfilledSoNos) {
  const fgNeeded = {};
  Object.entries(snap).forEach(([code, p]) => {
    const activeOrders = (p.orders||[]).filter(o =>
      !isDone(liveStatus[o.soNo]) && !fulfilledSoNos.has(o.soNo)
    );
    if (!activeOrders.length) return;
    const qty = activeOrders.reduce((s,o)=>s+(o.qty||0),0);
    if (!fgNeeded[code]) fgNeeded[code] = { qty:0, uom:'UNIT', revenue:0, orders:[], customers:new Set(), deliveryDates:[] };
    fgNeeded[code].qty += qty;
    fgNeeded[code].revenue += p.totalValue||0;
    activeOrders.forEach(o => {
      fgNeeded[code].orders.push(o);
      fgNeeded[code].customers.add(o.customer);
      if (o.deliveryDate) fgNeeded[code].deliveryDates.push(o.deliveryDate);
    });
    fgNeeded[code].description = p.description;
  });

  intake.forEach(po => {
    (po.items||[]).forEach(item => {
      const code = CODE_MAP[item.itemcode]||item.itemcode;
      const qty = parseFloat(item.qty||0);
      if (!fgNeeded[code]) fgNeeded[code] = { qty:0, uom:item.uom||'UNIT', revenue:0, orders:[], customers:new Set(), deliveryDates:[], description:item.itemdescription||code };
      fgNeeded[code].qty += qty;
      fgNeeded[code].revenue += parseFloat(item.amount||0);
      fgNeeded[code].orders.push({ soNo:po.docno, customer:po.customerName, qty, date:po.submittedAt?.slice(0,10) });
      fgNeeded[code].customers.add(po.customerName);
      if (po.deliveryDate) fgNeeded[code].deliveryDates.push(po.deliveryDate);
    });
  });

  return fgNeeded;
}

// -- Main handler --------------------------------------------------------------

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(200).end();

  const type = req.query.type || 'production';
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();

  try {
    // ── DATA: Postgres for SQL Account data, Redis for OCC-native ─────────
    const [snap, { stock, updatedAt: stockUpdatedAt }, invoices, doList, intakeRaw, bomRaw] = await Promise.all([
      buildByProductFromPostgres(),
      buildStockFromPostgres(),
      getInvoicesFromPostgres(),
      getDOsFromPostgres(),
      client.get('mazza_po_intake'),
      client.get('mazza_bom'),
    ]);

    const intake = intakeRaw ? JSON.parse(intakeRaw) : [];
    const bom    = bomRaw    ? JSON.parse(bomRaw)    : {};

    // SO live status
    let soLive = [];
    try {
      const pgSO = await pgQuery(
        `SELECT docno AS id, dockey, docref3 AS statusnote, status, cancelled, agent
         FROM sql_salesorders
         WHERE cancelled = false
         ORDER BY docdate DESC`
      );
      soLive = pgSO.rows.map(s => ({
        id:      s.id,
        docNo:   s.id,
        dockey:  s.dockey,
        status:  s.cancelled ? 'Cancelled'
                 : (s.statusnote||'').toUpperCase().trim().startsWith('DONE') ? 'Done'
                 : 'Active',
      }));
    } catch(e) {
      const soLiveRaw2 = await client.get('mazza_so').catch(()=>null);
      soLive = soLiveRaw2 ? JSON.parse(soLiveRaw2) : [];
    }

    const liveStatus = {};
    soLive.forEach(s => {
      liveStatus[s.id]     = s.status||'Active';
      liveStatus[s.dockey] = s.status||'Active';
      if (s.docNo) liveStatus[s.docNo] = s.status||'Active';
    });

    const doCustomerSet = new Set(doList.map(d => (d.customer||'').toUpperCase().trim()));
    const today = new Date();
    const fulfilledSoNos = new Set();
    Object.entries(snap).forEach(([code, p]) => {
      (p.orders||[]).forEach(o => {
        if (isDone(liveStatus[o.soNo])) { fulfilledSoNos.add(o.soNo); return; }
        if (o.deliveryDate) {
          const delDate = new Date(o.deliveryDate);
          if (delDate < today && doCustomerSet.has((o.customer||'').toUpperCase().trim())) {
            fulfilledSoNos.add(o.soNo);
          }
        }
      });
    });

    const fgNeeded = getActiveFG(snap, intake, liveStatus, fulfilledSoNos);

    // -- PRODUCTION PLAN -------------------------------------------------------
    if (type === 'production') {
      const activeSnap = {};
      for (const [code, p] of Object.entries(snap)) {
        const activeOrders = (p.orders||[]).filter(o=>
          !isDone(liveStatus[o.soNo]) && !fulfilledSoNos.has(o.soNo)
        );
        if (!activeOrders.length) continue;
        const totalQty   = activeOrders.reduce((s,o)=>s+(o.qty||0),0);
        const totalValue = activeOrders.reduce((s,o)=>s+(o.qty||0)*(o.unitPrice||p.unitPrice||0),0);
        const doneOrders = (p.orders||[]).filter(o=>isDone(liveStatus[o.soNo])||fulfilledSoNos.has(o.soNo));
        activeSnap[code] = { ...p, orders:activeOrders, doneOrders, totalQty, totalValue:totalValue||p.totalValue, soCount:activeOrders.length, source:'snapshot' };
      }

      const intakeProds = {};
      intake.forEach(po => {
        (po.items||[]).forEach(item => {
          const code = CODE_MAP[item.itemcode]||item.itemcode;
          const qty  = parseFloat(item.qty||0);
          const rev  = parseFloat(item.amount||0);
          if (!intakeProds[code]) intakeProds[code] = { itemCode:code, description:item.itemdescription||code, uom:item.uom||'UNIT', totalQty:0, totalValue:0, soCount:0, customers:[], orders:[], source:'po_intake' };
          intakeProds[code].totalQty   += qty;
          intakeProds[code].totalValue += rev;
          intakeProds[code].soCount    += 1;
          if (!intakeProds[code].customers.includes(po.customerName)) intakeProds[code].customers.push(po.customerName);
          intakeProds[code].orders.push({ soNo:po.docno||'', customer:po.customerName, qty, uom:item.uom||'UNIT', date:(po.submittedAt||'').slice(0,10) });
        });
      });

      const merged = { ...activeSnap };
      for (const [code, ip] of Object.entries(intakeProds)) {
        if (merged[code]) {
          const existingSoNos = new Set((merged[code].orders||[]).map(o=>o.soNo));
          const newOrders = ip.orders.filter(o=>!existingSoNos.has(o.soNo));
          merged[code] = { ...merged[code], orders:[...merged[code].orders,...newOrders], totalQty:merged[code].totalQty+newOrders.reduce((s,o)=>s+o.qty,0), totalValue:merged[code].totalValue+newOrders.reduce((s,o)=>s+(o.qty*(ip.totalValue/Math.max(ip.totalQty,1))),0), soCount:merged[code].soCount+newOrders.length, source:'both' };
        } else { merged[code] = ip; }
      }

      const products = Object.values(merged).map(p => {
        const bomEntry = bom[p.itemCode];
        const revenue  = p.totalValue||0;
        if (!bomEntry) return { ...p, revenue, bomMissing:true, totalRawCost:null };
        const uomCounts = {};
        (p.orders||[]).forEach(o=>{ uomCounts[o.uom]=(uomCounts[o.uom]||0)+o.qty; });
        const orderedUom = Object.entries(uomCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]||'UNIT';
        const mult    = getMultiplier(p.itemCode, orderedUom);
        const bomUnits= p.totalQty * mult;
        const rawMaterials = bomEntry.components.map(comp => ({ code:comp.code, uom:comp.uom, qtyPerUnit:comp.qty, totalQty:comp.qty*bomUnits, refCostPerUnit:comp.refCost||0, totalCost:comp.qty*bomUnits*(comp.refCost||0) }));
        const totalRawCost = rawMaterials.reduce((s,r)=>s+r.totalCost,0);
        const grossProfit  = revenue - totalRawCost;
        const margin = revenue>0?(grossProfit/revenue)*100:0;
        return { ...p, revenue, rawMaterials, totalRawCost, grossProfit, margin, bomMissing:false, multiplier:mult, orderedUom, bomUnits };
      }).sort((a,b)=>b.revenue-a.revenue);

      const totals = products.reduce((acc,r)=>({ revenue:acc.revenue+(r.revenue||0), rawCost:acc.rawCost+(r.totalRawCost||0), grossProfit:acc.grossProfit+(r.grossProfit||0) }),{revenue:0,rawCost:0,grossProfit:0});
      totals.margin = totals.revenue>0?(totals.grossProfit/totals.revenue*100):0;

      const phasedOut = Object.entries(snap).filter(([code])=>!activeSnap[code]).map(([code,p])=>({itemCode:code,description:p.description,totalQty:p.totalQty,totalValue:p.totalValue}));

      return res.status(200).json({ products, totals, phasedOut, meta:{ snapshotActive:Object.keys(activeSnap).length, snapshotPhasedOut:phasedOut.length, fromPoIntake:Object.keys(intakeProds).length, merged:products.length, source:'postgres', updatedAt:new Date().toISOString() }});
    }

    // -- GAP ANALYSIS ----------------------------------------------------------
    if (type === 'gap') {
      const custFreq = {};
      invoices.forEach(iv=>{ const c=iv.customer||''; custFreq[c]=(custFreq[c]||0)+1; });

      const fgGap = Object.entries(fgNeeded).map(([code,p]) => {
        const s = stock[code];
        const onHand  = s ? Math.max(0,s.balance) : 0;
        const required= p.qty;
        const gap     = required - onHand;
        const pct     = required>0?Math.min(Math.round((onHand/required)*100),100):100;
        const sortedDates  = (p.deliveryDates||[]).sort();
        const nextDelivery = sortedDates[0]||null;
        const daysLeft     = nextDelivery?Math.floor((new Date(nextDelivery)-new Date())/(1000*60*60*24)):null;
        const custScore    = [...(p.customers||[])].reduce((s,c)=>s+(custFreq[c]||0),0);
        return { itemCode:code, description:p.description||code, required, onHand, gap:Math.max(0,gap), canFulfil:gap<=0, pct, customers:[...(p.customers||[])], nextDelivery, daysLeft, custScore, revenue:p.revenue, orders:p.orders.length };
      }).sort((a,b)=>{ if(!a.canFulfil&&b.canFulfil)return -1; if(a.canFulfil&&!b.canFulfil)return 1; if(a.daysLeft!==null&&b.daysLeft!==null)return a.daysLeft-b.daysLeft; if(a.daysLeft!==null)return -1; if(b.daysLeft!==null)return 1; return b.custScore-a.custScore; });

      const cannotFulfilFG = {};
      fgGap.filter(f=>!f.canFulfil).forEach(f=>{ cannotFulfilFG[f.itemCode]={ qty:f.gap, uom:'UNIT' }; });
      const rmNeeded = explodeBOM(cannotFulfilFG, bom);

      const rmGap = Object.values(rmNeeded).map(rm => {
        const s = stock[rm.code];
        const onHand = s?Math.max(0,s.balance):0;
        const gap    = Math.max(0,rm.needed-onHand);
        const status = gap>0?(onHand<0?'short':'short'):onHand<rm.needed*1.2?'low':'ok';
        return { ...rm, onHand, gap, status, pct:rm.needed>0?Math.min(Math.round((onHand/rm.needed)*100),999):100, totalCost:gap*(rm.refCost||0) };
      }).sort((a,b)=>{ const o={short:0,low:1,ok:2}; if(o[a.status]!==o[b.status])return o[a.status]-o[b.status]; return b.totalCost-a.totalCost; });

      return res.status(200).json({ fgGap, rmGap, summary:{ totalFG:fgGap.length, canFulfil:fgGap.filter(f=>f.canFulfil).length, cannotFulfil:fgGap.filter(f=>!f.canFulfil).length, rmShort:rmGap.filter(r=>r.status==='short').length, stockUpdatedAt }});
    }

    // -- PURCHASE LIST ---------------------------------------------------------
    if (type === 'purchase') {
      const rmNeeded = explodeBOM(
        Object.fromEntries(Object.entries(fgNeeded).map(([k,v])=>[k,{qty:v.qty,uom:v.uom||'UNIT'}])),
        bom
      );

      const items = Object.values(rmNeeded).map(rm => {
        const s = stock[rm.code];
        const onHand = s?s.balance:0;
        const netBuy = rm.needed - Math.max(0,onHand);
        const status = netBuy>0?(onHand<0?'critical':'buy'):'sufficient';
        return { code:rm.code, uom:rm.uom, needed:rm.needed, onHand, netBuy:Math.max(0,netBuy), status, estCost:Math.max(0,netBuy)*(rm.refCost||0), coverage:rm.needed>0?Math.min(Math.round((Math.max(0,onHand)/rm.needed)*100),100):100, refCost:rm.refCost, usedIn:rm.usedIn };
      }).sort((a,b)=>{ const o={critical:0,buy:1,sufficient:2}; if(o[a.status]!==o[b.status])return o[a.status]-o[b.status]; return b.estCost-a.estCost; });

      const totals = { totalItems:items.length, toBuy:items.filter(i=>i.status!=='sufficient').length, critical:items.filter(i=>i.status==='critical').length, sufficient:items.filter(i=>i.status==='sufficient').length, estTotalCost:items.reduce((s,i)=>s+i.estCost,0) };
      return res.status(200).json({ items, totals, stockUpdatedAt });
    }

    return res.status(400).json({ error: 'Unknown type. Use ?type=production|gap|purchase' });

  } catch(err) {
    console.error('Operations error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    await client.disconnect();
  }
}
