// ============================================================
// GRN SYNC SCRIPT
// File: /api/sync-grn.js
// Pulls GRN data from SQL Account API → Postgres
// Add to cron: run every 15 minutes
// ============================================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SQL_ACCOUNT_BASE = process.env.SQL_ACCOUNT_API_URL;
const SQL_ACCOUNT_KEY  = process.env.SQL_ACCOUNT_API_KEY;

async function fetchFromSQLAccount(endpoint, params = {}) {
  const url = new URL(`${SQL_ACCOUNT_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  
  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${SQL_ACCOUNT_KEY}`,
      'Accept': 'application/json'
    }
  });

  if (!res.ok) throw new Error(`SQL Account API error: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getLastSyncDate(client) {
  const { rows } = await client.query(`
    SELECT MAX(lastmodified) as last_sync 
    FROM sql_goodsreceived
  `);
  return rows[0]?.last_sync || '2020-01-01 00:00:00';
}

async function upsertGRN(client, grn) {
  await client.query(`
    INSERT INTO sql_goodsreceived 
      (dockey, docno, docdate, code, companyname, description, cancelled, totalamt, lastmodified, syncdate)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
    ON CONFLICT (dockey) DO UPDATE SET
      docno        = EXCLUDED.docno,
      docdate      = EXCLUDED.docdate,
      code         = EXCLUDED.code,
      companyname  = EXCLUDED.companyname,
      description  = EXCLUDED.description,
      cancelled    = EXCLUDED.cancelled,
      totalamt     = EXCLUDED.totalamt,
      lastmodified = EXCLUDED.lastmodified,
      syncdate     = NOW()
  `, [
    grn.dockey, grn.docno, grn.docdate, grn.code,
    grn.companyname, grn.description, grn.cancelled || 0,
    grn.totalamt, grn.lastmodified
  ]);
}

async function upsertGRNDetail(client, dtl) {
  await client.query(`
    INSERT INTO sql_goodsreceived_dtl
      (dtlkey, dockey, itemcode, description, qty, unitprice, amount, uom)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
    ON CONFLICT (dtlkey) DO UPDATE SET
      dockey      = EXCLUDED.dockey,
      itemcode    = EXCLUDED.itemcode,
      description = EXCLUDED.description,
      qty         = EXCLUDED.qty,
      unitprice   = EXCLUDED.unitprice,
      amount      = EXCLUDED.amount,
      uom         = EXCLUDED.uom
  `, [
    dtl.dtlkey, dtl.dockey, dtl.itemcode, dtl.description,
    dtl.qty, dtl.unitprice, dtl.amount, dtl.uom
  ]);
}

export default async function handler(req, res) {
  // Protect endpoint
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  let synced = 0;
  let errors = [];

  try {
    const lastSync = await getLastSyncDate(client);
    console.log(`[GRN SYNC] Last sync: ${lastSync}`);

    // Fetch GRNs modified since last sync
    // SQL Account endpoint: /goodsreceived
    // Params: datefrom, dateto (or lastmodified filter)
    const today = new Date().toISOString().split('T')[0];
    const fromDate = lastSync.split(' ')[0] || '2020-01-01';

    const data = await fetchFromSQLAccount('goodsreceived', {
      datefrom: fromDate,
      dateto: today,
      includedtl: 1
    });

    const grns = Array.isArray(data) ? data : (data.data || data.records || []);
    console.log(`[GRN SYNC] Fetched ${grns.length} records from SQL Account`);

    await client.query('BEGIN');

    for (const grn of grns) {
      try {
        await upsertGRN(client, grn);
        
        // Sync line items if included
        if (grn.details && Array.isArray(grn.details)) {
          for (const dtl of grn.details) {
            await upsertGRNDetail(client, { ...dtl, dockey: grn.dockey });
          }
        }
        synced++;
      } catch (err) {
        console.error(`[GRN SYNC] Error on dockey ${grn.dockey}:`, err.message);
        errors.push({ dockey: grn.dockey, error: err.message });
      }
    }

    await client.query('COMMIT');
    console.log(`[GRN SYNC] Done. Synced: ${synced}, Errors: ${errors.length}`);

    return res.status(200).json({
      success: true,
      synced,
      errors: errors.length,
      errorDetails: errors,
      lastSync: new Date().toISOString()
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[GRN SYNC] Fatal error:', err);
    return res.status(500).json({ error: err.message });

  } finally {
    client.release();
  }
}
