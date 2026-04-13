// api/debug-rv.js
// ONE-TIME diagnostic — shows the actual sql_raw structure of RV records
// Delete after confirming knockoff structure
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
      // Get one RV that has a non-null sql_raw with some content
      const { rows } = await client.query(`
        SELECT 
          dockey,
          docno,
          docamt,
          -- Show the top-level keys in sql_raw
          array(SELECT jsonb_object_keys(sql_raw)) AS top_keys,
          -- Show first knockoff entry if exists
          sql_raw->'knockoff'                       AS knockoff_array,
          sql_raw->'sdsrv'                          AS sdsrv_array,
          -- docamt from sql_raw
          sql_raw->>'docamt'                        AS raw_docamt
        FROM sql_receiptvouchers
        WHERE sql_raw IS NOT NULL
          AND cancelled = false
          AND docamt IS NOT NULL
        ORDER BY dockey DESC
        LIMIT 3
      `);
      
      return res.status(200).json({ 
        count: rows.length,
        samples: rows,
        note: 'Shows sql_raw structure of 3 recent RVs'
      });
    } finally {
      client.release();
    }
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
