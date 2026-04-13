// ============================================================
// CUSTOMER SYNC FIX
// File: /api/sync-customers.js
// Pulls ALL customers from SQL Account → Postgres
// Fixes: new customers created in SQL not appearing in OCC
// Run on cron: every 5 minutes
// ============================================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SQL_BASE = process.env.SQL_ACCOUNT_API_URL;
const SQL_KEY  = process.env.SQL_ACCOUNT_API_KEY;

async function fetchCustomers(lastModified) {
  const url = new URL(`${SQL_BASE}/customer`);
  if (lastModified) url.searchParams.append('lastmodified', lastModified);
  
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${SQL_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`SQL Account error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || data.records || []);
}

async function getLastSync(client) {
  const { rows } = await client.query(
    `SELECT MAX(lastmodified) as last FROM sql_customers`
  );
  return rows[0]?.last || null;
}

export default async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();
  let synced = 0, errors = [];

  try {
    const lastSync = await getLastSync(client);
    console.log(`[CUSTOMER SYNC] Last sync: ${lastSync}`);

    const customers = await fetchCustomers(lastSync);
    console.log(`[CUSTOMER SYNC] Fetched ${customers.length} records`);

    await client.query('BEGIN');

    for (const c of customers) {
      try {
        await client.query(`
          INSERT INTO sql_customers 
            (code, companyname, address1, address2, address3, address4,
             postcode, phone1, phone2, email, creditlimit, outstanding,
             agent, area, lastmodified, syncdate)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW())
          ON CONFLICT (code) DO UPDATE SET
            companyname  = EXCLUDED.companyname,
            address1     = EXCLUDED.address1,
            address2     = EXCLUDED.address2,
            address3     = EXCLUDED.address3,
            address4     = EXCLUDED.address4,
            postcode     = EXCLUDED.postcode,
            phone1       = EXCLUDED.phone1,
            phone2       = EXCLUDED.phone2,
            email        = EXCLUDED.email,
            creditlimit  = EXCLUDED.creditlimit,
            outstanding  = EXCLUDED.outstanding,
            agent        = EXCLUDED.agent,
            area         = EXCLUDED.area,
            lastmodified = EXCLUDED.lastmodified,
            syncdate     = NOW()
        `, [
          c.code, c.companyname, c.address1, c.address2, c.address3, c.address4,
          c.postcode, c.phone1, c.phone2, c.email, c.creditlimit, c.outstanding,
          c.agent, c.area, c.lastmodified
        ]);
        synced++;
      } catch (err) {
        errors.push({ code: c.code, error: err.message });
      }
    }

    await client.query('COMMIT');
    console.log(`[CUSTOMER SYNC] Done. Synced: ${synced}, Errors: ${errors.length}`);

    return res.status(200).json({ success: true, synced, errors: errors.length });

  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
