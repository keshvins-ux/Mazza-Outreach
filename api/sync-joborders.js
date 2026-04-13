// ============================================================
// JOB ORDER SYNC — FIXES PRODUCTION SCHEDULE
// File: /api/sync-joborders.js
// This is why Production shows "Failed to load" — we never synced job orders
// Run on cron: every 5 minutes
// ============================================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SQL_BASE = process.env.SQL_ACCOUNT_API_URL;
const SQL_KEY  = process.env.SQL_ACCOUNT_API_KEY;

async function fetchJobOrders(lastModified) {
  const url = new URL(`${SQL_BASE}/joborder`);
  if (lastModified) url.searchParams.append('lastmodified', lastModified);
  
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${SQL_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`SQL Account error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || data.records || []);
}

async function getLastSync(client) {
  try {
    const { rows } = await client.query(
      `SELECT MAX(lastmodified) as last FROM sql_joborders`
    );
    return rows[0]?.last || null;
  } catch { return null; }
}

export default async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  let synced = 0, errors = [];

  try {
    // Create table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS sql_joborders (
        dockey        INTEGER PRIMARY KEY,
        docno         VARCHAR(30),
        docdate       VARCHAR(20),
        code          VARCHAR(20),
        companyname   VARCHAR(200),
        description   TEXT,
        itemcode      VARCHAR(30),
        itemdesc      VARCHAR(200),
        qty           DECIMAL(18,4),
        qtyinput      DECIMAL(18,4),
        qtydone       DECIMAL(18,4),
        uom           VARCHAR(20),
        status        VARCHAR(20),
        startdate     VARCHAR(20),
        enddate       VARCHAR(20),
        cancelled     SMALLINT DEFAULT 0,
        lastmodified  VARCHAR(30),
        syncdate      TIMESTAMP DEFAULT NOW()
      )
    `);

    const lastSync = await getLastSync(client);
    const jobs = await fetchJobOrders(lastSync);
    console.log(`[JOB SYNC] Fetched ${jobs.length} records`);

    await client.query('BEGIN');

    for (const j of jobs) {
      try {
        await client.query(`
          INSERT INTO sql_joborders
            (dockey, docno, docdate, code, companyname, description,
             itemcode, itemdesc, qty, qtyinput, qtydone, uom, status,
             startdate, enddate, cancelled, lastmodified, syncdate)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,NOW())
          ON CONFLICT (dockey) DO UPDATE SET
            docno        = EXCLUDED.docno,
            docdate      = EXCLUDED.docdate,
            itemcode     = EXCLUDED.itemcode,
            itemdesc     = EXCLUDED.itemdesc,
            qty          = EXCLUDED.qty,
            qtyinput     = EXCLUDED.qtyinput,
            qtydone      = EXCLUDED.qtydone,
            status       = EXCLUDED.status,
            startdate    = EXCLUDED.startdate,
            enddate      = EXCLUDED.enddate,
            cancelled    = EXCLUDED.cancelled,
            lastmodified = EXCLUDED.lastmodified,
            syncdate     = NOW()
        `, [
          j.dockey, j.docno, j.docdate, j.code, j.companyname, j.description,
          j.itemcode, j.itemdesc, j.qty, j.qtyinput, j.qtydone, j.uom, j.status,
          j.startdate, j.enddate, j.cancelled || 0, j.lastmodified
        ]);
        synced++;
      } catch (err) {
        errors.push({ dockey: j.dockey, error: err.message });
      }
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, synced, errors: errors.length });

  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
