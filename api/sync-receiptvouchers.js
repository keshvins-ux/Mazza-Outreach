// ============================================================
// RECEIPT VOUCHER SYNC — FIXES AR OUTSTANDING
// File: /api/sync-receiptvouchers.js
// Syncs all customer payments/receipts from SQL Account
// Required for accurate AR outstanding computation
// Run on cron: every 5 minutes
// ============================================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SQL_BASE = process.env.SQL_ACCOUNT_API_URL;
const SQL_KEY  = process.env.SQL_ACCOUNT_API_KEY;

async function fetchRVs(lastModified) {
  const url = new URL(`${SQL_BASE}/receiptvoucher`);
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
      `SELECT MAX(lastmodified) as last FROM sql_receiptvouchers`
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
    await client.query(`
      CREATE TABLE IF NOT EXISTS sql_receiptvouchers (
        dockey        INTEGER PRIMARY KEY,
        docno         VARCHAR(30),
        docdate       VARCHAR(20),
        code          VARCHAR(20),
        companyname   VARCHAR(200),
        description   TEXT,
        totalamt      DECIMAL(18,4),
        knockoffkey   INTEGER,
        knockoffamt   DECIMAL(18,4),
        cancelled     SMALLINT DEFAULT 0,
        lastmodified  VARCHAR(30),
        syncdate      TIMESTAMP DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_rv_knockoffkey ON sql_receiptvouchers(knockoffkey);
      CREATE INDEX IF NOT EXISTS idx_rv_code ON sql_receiptvouchers(code);
      CREATE INDEX IF NOT EXISTS idx_rv_cancelled ON sql_receiptvouchers(cancelled);
    `);

    const lastSync = await getLastSync(client);
    const rvs = await fetchRVs(lastSync);
    console.log(`[RV SYNC] Fetched ${rvs.length} records`);

    await client.query('BEGIN');

    for (const rv of rvs) {
      try {
        await client.query(`
          INSERT INTO sql_receiptvouchers
            (dockey, docno, docdate, code, companyname, description,
             totalamt, knockoffkey, knockoffamt, cancelled, lastmodified, syncdate)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
          ON CONFLICT (dockey) DO UPDATE SET
            docno        = EXCLUDED.docno,
            docdate      = EXCLUDED.docdate,
            code         = EXCLUDED.code,
            companyname  = EXCLUDED.companyname,
            totalamt     = EXCLUDED.totalamt,
            knockoffkey  = EXCLUDED.knockoffkey,
            knockoffamt  = EXCLUDED.knockoffamt,
            cancelled    = EXCLUDED.cancelled,
            lastmodified = EXCLUDED.lastmodified,
            syncdate     = NOW()
        `, [
          rv.dockey, rv.docno, rv.docdate, rv.code, rv.companyname, rv.description,
          rv.totalamt, rv.knockoffkey, rv.knockoffamt, rv.cancelled || 0, rv.lastmodified
        ]);
        synced++;
      } catch (err) {
        errors.push({ dockey: rv.dockey, error: err.message });
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
