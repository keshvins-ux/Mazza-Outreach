// sync-receiptvouchers.js — Fixed with AWS4 auth
// sql_receiptvouchers already exists in your Postgres — just keeping it updated
import crypto from 'crypto';
import { Pool } from 'pg';

function sign(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }
function getSignatureKey(key, d, r, s) { return sign(sign(sign(sign(Buffer.from('AWS4'+key), d), r), s), 'aws4_request'); }

function buildHeaders(path, qs='') {
  const { SQL_ACCESS_KEY, SQL_SECRET_KEY, SQL_HOST, SQL_REGION, SQL_SERVICE } = process.env;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g,'').slice(0,15)+'Z';
  const dateStamp = amzDate.slice(0,8);
  const host = SQL_HOST.replace('https://','');
  const payloadHash = crypto.createHash('sha256').update('','utf8').digest('hex');
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const canonicalRequest = ['GET', path, qs, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credScope = `${dateStamp}/${SQL_REGION}/${SQL_SERVICE}/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amzDate, credScope, crypto.createHash('sha256').update(canonicalRequest,'utf8').digest('hex')].join('\n');
  const sig = crypto.createHmac('sha256', getSignatureKey(SQL_SECRET_KEY,dateStamp,SQL_REGION,SQL_SERVICE)).update(sts).digest('hex');
  return {
    'Authorization': `AWS4-HMAC-SHA256 Credential=${SQL_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    'x-amz-date': amzDate, 'Content-Type': 'application/json',
    'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0',
  };
}

async function fetchAllPages(endpoint) {
  const { SQL_HOST } = process.env;
  let all = [], offset = 0;
  const limit = 50;
  while (true) {
    const qs = `limit=${limit}&offset=${offset}`;
    const headers = buildHeaders(endpoint, qs);
    const r = await fetch(`${SQL_HOST}${endpoint}?${qs}`, { headers });
    const text = await r.text();
    if (text.trim().startsWith('<!')) break;
    let data;
    try { data = JSON.parse(text); } catch(e) { break; }
    const items = data.data || (Array.isArray(data) ? data : []);
    if (!items.length) break;
    all = all.concat(items);
    offset += limit;
    if (all.length > 20000) break;
  }
  return all;
}

let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return _pool;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const rvs = await fetchAllPages('/receiptvoucher');
    const client = await getPool().connect();
    let synced = 0;

    try {
      await client.query('BEGIN');
      for (const rv of rvs) {
        if (!rv.dockey) continue;
        await client.query(`
          INSERT INTO sql_receiptvouchers
            (dockey, docno, docdate, code, companyname, description,
             docamt, paymentmethod, status, cancelled, gltransid, occ_synced_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
          ON CONFLICT (dockey) DO UPDATE SET
            docno=EXCLUDED.docno, docdate=EXCLUDED.docdate,
            code=EXCLUDED.code, companyname=EXCLUDED.companyname,
            docamt=EXCLUDED.docamt, paymentmethod=EXCLUDED.paymentmethod,
            status=EXCLUDED.status, cancelled=EXCLUDED.cancelled,
            occ_synced_at=NOW()
        `, [
          rv.dockey, rv.docno, rv.docdate, rv.code,
          rv.companyname || rv.description, rv.description,
          parseFloat(rv.docamt)||0,
          rv.paymentmethod || rv.pymtmethod || null,
          rv.status || null,
          rv.cancelled || false,
          rv.gltransid || null
        ]);
        synced++;
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    return res.status(200).json({ success: true, synced });
  } catch (err) {
    console.error('[RV SYNC]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
