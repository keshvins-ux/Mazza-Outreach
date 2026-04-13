// api/sync-stockitems.js
// Standalone stock item sync — chunked to avoid Vercel 60s timeout
// Call with ?offset=0, ?offset=500, ?offset=1000 etc until done=true
// Or call without offset to auto-run all chunks sequentially (may timeout for large sets)

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

const safe = v => (v === undefined || v === null || v === '----' || v === '') ? null : v;
const safeDate = v => (v && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ? v.slice(0,10) : null;

let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return _pool;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const startOffset = parseInt(req.query?.offset || '0');
  const batchSize = 200; // fetch 200 at a time to stay within timeout
  const { SQL_HOST } = process.env;

  let upserted = 0, fetched = 0;

  try {
    const qs = `limit=${batchSize}&offset=${startOffset}`;
    const headers = buildHeaders('/stockitem', qs);
    const r = await fetch(`${SQL_HOST}/stockitem?${qs}`, { headers });
    const text = await r.text();

    if (text.trim().startsWith('<!')) {
      return res.status(200).json({ done: true, blocked: true, fetched: 0, upserted: 0 });
    }

    let data;
    try { data = JSON.parse(text); } catch(e) {
      return res.status(200).json({ done: true, parse_error: true, fetched: 0, upserted: 0 });
    }

    const records = data.data || (Array.isArray(data) ? data : []);
    fetched = records.length;

    if (fetched === 0) {
      return res.status(200).json({ done: true, fetched: 0, upserted: 0, next_offset: null });
    }

    const client = await getPool().connect();
    try {
      await client.query('BEGIN');
      for (const r of records) {
        try {
          await client.query(`
            INSERT INTO sql_stockitems (
              dockey,code,description,description2,description3,
              stockgroup,stockcontrol,costingmethod,serialnumber,
              remark1,remark2,minqty,maxqty,reorderlevel,reorderqty,
              shelf,suom,itemtype,leadtime,bom_leadtime,bom_asmcost,
              sltax,phtax,tariff,irbm_classification,stockmatrix,
              defuom_st,defuom_sl,defuom_ph,scriptcode,isactive,
              balsqty,balsuomqty,creationdate,picture,pictureclass,
              attachments,note,sql_lastmodified,synced_at
            ) VALUES (
              $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
              $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
              $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,NOW()
            )
            ON CONFLICT (code) DO UPDATE SET
              description=EXCLUDED.description,
              isactive=EXCLUDED.isactive,
              balsqty=EXCLUDED.balsqty,
              reorderlevel=EXCLUDED.reorderlevel,
              sql_lastmodified=EXCLUDED.sql_lastmodified,
              synced_at=NOW()
          `, [
            r.dockey, safe(r.code), safe(r.description), safe(r.description2), safe(r.description3),
            safe(r.stockgroup), r.stockcontrol??null, r.costingmethod??null, r.serialnumber??null,
            safe(r.remark1), safe(r.remark2), safe(r.minqty), safe(r.maxqty),
            safe(r.reorderlevel), safe(r.reorderqty), safe(r.shelf), safe(r.suom),
            safe(r.itemtype), r.leadtime??null, r.bom_leadtime??null, safe(r.bom_asmcost),
            safe(r.sltax), safe(r.phtax), safe(r.tariff), safe(r.irbm_classification),
            safe(r.stockmatrix), safe(r.defuom_st), safe(r.defuom_sl), safe(r.defuom_ph),
            safe(r.scriptcode), r.isactive??null, safe(r.balsqty), safe(r.balsuomqty),
            safeDate(r.creationdate), safe(r.picture), safe(r.pictureclass),
            r.attachments ? JSON.stringify(r.attachments) : null,
            safe(r.note), r.lastmodified??null
          ]);
          upserted++;
        } catch(e) {
          console.error('stockitem err code='+r.code+':', e.message.slice(0,80));
        }
      }
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const done = fetched < batchSize;
    const next_offset = done ? null : startOffset + batchSize;

    return res.status(200).json({
      done,
      fetched,
      upserted,
      current_offset: startOffset,
      next_offset,
      message: done ? 'All done' : `Call again with ?offset=${next_offset}`
    });

  } catch (err) {
    console.error('[STOCKITEM SYNC]', err.message);
    return res.status(500).json({ error: err.message, offset: startOffset });
  }
}
