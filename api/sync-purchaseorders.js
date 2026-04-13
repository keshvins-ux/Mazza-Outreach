// ============================================================
// PURCHASE ORDER SYNC — UNLOCKS PROCUREMENT MODULE
// File: /api/sync-purchaseorders.js
// Syncs POs + Purchase Invoices from SQL Account
// Run on cron: every 10 minutes
// ============================================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SQL_BASE = process.env.SQL_ACCOUNT_API_URL;
const SQL_KEY  = process.env.SQL_ACCOUNT_API_KEY;

async function fetchSQL(endpoint, lastModified) {
  const url = new URL(`${SQL_BASE}/${endpoint}`);
  if (lastModified) url.searchParams.append('lastmodified', lastModified);
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${SQL_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`${endpoint}: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || data.records || []);
}

export default async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  let po_synced = 0, inv_synced = 0;

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sql_purchaseorders (
        dockey        INTEGER PRIMARY KEY,
        docno         VARCHAR(30),
        docdate       VARCHAR(20),
        code          VARCHAR(20),
        companyname   VARCHAR(200),
        description   TEXT,
        totalamt      DECIMAL(18,4),
        cancelled     SMALLINT DEFAULT 0,
        status        VARCHAR(20),
        lastmodified  VARCHAR(30),
        syncdate      TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sql_purchaseinvoices (
        dockey        INTEGER PRIMARY KEY,
        docno         VARCHAR(30),
        docdate       VARCHAR(20),
        code          VARCHAR(20),
        companyname   VARCHAR(200),
        description   TEXT,
        totalamt      DECIMAL(18,4),
        outstanding   DECIMAL(18,4),
        cancelled     SMALLINT DEFAULT 0,
        lastmodified  VARCHAR(30),
        syncdate      TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_po_code ON sql_purchaseorders(code);
      CREATE INDEX IF NOT EXISTS idx_pinv_code ON sql_purchaseinvoices(code);
    `);

    const lastPO = await client.query(`SELECT MAX(lastmodified) as last FROM sql_purchaseorders`);
    const pos = await fetchSQL('purchaseorder', lastPO.rows[0]?.last);
    console.log(`[PO SYNC] Fetched ${pos.length} POs`);

    await client.query('BEGIN');

    for (const p of pos) {
      await client.query(`
        INSERT INTO sql_purchaseorders
          (dockey, docno, docdate, code, companyname, description,
           totalamt, cancelled, status, lastmodified, syncdate)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (dockey) DO UPDATE SET
          docno = EXCLUDED.docno, totalamt = EXCLUDED.totalamt,
          status = EXCLUDED.status, cancelled = EXCLUDED.cancelled,
          lastmodified = EXCLUDED.lastmodified, syncdate = NOW()
      `, [p.dockey, p.docno, p.docdate, p.code, p.companyname, p.description,
          p.totalamt, p.cancelled||0, p.status, p.lastmodified]);
      po_synced++;
    }

    const lastINV = await client.query(`SELECT MAX(lastmodified) as last FROM sql_purchaseinvoices`);
    const invs = await fetchSQL('purchaseinvoice', lastINV.rows[0]?.last);
    console.log(`[PO SYNC] Fetched ${invs.length} purchase invoices`);

    for (const i of invs) {
      await client.query(`
        INSERT INTO sql_purchaseinvoices
          (dockey, docno, docdate, code, companyname, description,
           totalamt, outstanding, cancelled, lastmodified, syncdate)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (dockey) DO UPDATE SET
          totalamt = EXCLUDED.totalamt, outstanding = EXCLUDED.outstanding,
          cancelled = EXCLUDED.cancelled, lastmodified = EXCLUDED.lastmodified,
          syncdate = NOW()
      `, [i.dockey, i.docno, i.docdate, i.code, i.companyname, i.description,
          i.totalamt, i.outstanding||0, i.cancelled||0, i.lastmodified]);
      inv_synced++;
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, po_synced, inv_synced });

  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
