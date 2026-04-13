// api/debug-inv.js
// ONE-TIME diagnostic — shows actual invoice fields relevant to outstanding
import { Pool } from 'pg';

let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return _pool;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  try {
    const client = await getPool().connect();
    try {
      const { rows } = await client.query(`
        SELECT
          dockey,
          docno,
          docdate::text,
          companyname,
          docamt,
          d_amount,
          -- What's in sql_raw relevant to payment
          sql_raw->>'docamt'    AS raw_docamt,
          sql_raw->>'d_amount'  AS raw_d_amount,
          sql_raw->>'outstanding' AS raw_outstanding,
          sql_raw->>'status'    AS raw_status,
          -- Top keys in sql_raw
          array(SELECT jsonb_object_keys(sql_raw)) AS top_keys
        FROM sql_salesinvoices
        WHERE sql_raw IS NOT NULL
          AND cancelled = false
        ORDER BY dockey DESC
        LIMIT 3
      `);

      return res.status(200).json({ samples: rows });
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
