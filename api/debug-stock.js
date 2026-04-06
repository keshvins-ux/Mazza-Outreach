import crypto from 'crypto';

function sign(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }
function getSignatureKey(key, d, r, s) { return sign(sign(sign(sign(Buffer.from('AWS4'+key), d), r), s), 'aws4_request'); }

function buildHeaders(path, qs = '') {
  const { SQL_ACCESS_KEY, SQL_SECRET_KEY, SQL_HOST, SQL_REGION, SQL_SERVICE } = process.env;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const dateStamp = amzDate.slice(0, 8);
  const host = SQL_HOST.replace('https://', '');
  const payloadHash = crypto.createHash('sha256').update('', 'utf8').digest('hex');
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const canonicalRequest = ['GET', path, qs, canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credScope = `${dateStamp}/${SQL_REGION}/${SQL_SERVICE}/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amzDate, credScope,
    crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex')].join('\n');
  const sig = crypto.createHmac('sha256',
    getSignatureKey(SQL_SECRET_KEY, dateStamp, SQL_REGION, SQL_SERVICE)).update(sts).digest('hex');
  return {
    'Authorization': `AWS4-HMAC-SHA256 Credential=${SQL_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    'x-amz-date': amzDate, 'Content-Type': 'application/json', 'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { SQL_HOST } = process.env;
  const results = {};

  // ── Test 1: stock balance endpoint ──────────────────────────────────
  try {
    const qs = 'limit=3&offset=0';
    const r = await fetch(`${SQL_HOST}/stockbalance?${qs}`, { headers: buildHeaders('/stockbalance', qs) });
    const text = await r.text();
    results.stockbalance = {
      status: r.status,
      sample: text.slice(0, 800),
      fields: (() => { try { const d = JSON.parse(text); const items = d.data||d; return items[0] ? Object.keys(items[0]) : []; } catch(e) { return `parse error: ${e.message}`; } })()
    };
  } catch(e) { results.stockbalance = { error: e.message }; }

  // ── Test 2: SO endpoint — check amount field names ───────────────────
  try {
    const qs = 'limit=3&offset=0';
    const r = await fetch(`${SQL_HOST}/salesorder?${qs}`, { headers: buildHeaders('/salesorder', qs) });
    const text = await r.text();
    results.salesorder = {
      status: r.status,
      sample: text.slice(0, 800),
      fields: (() => { try { const d = JSON.parse(text); const items = d.data||d; return items[0] ? Object.keys(items[0]) : []; } catch(e) { return `parse error: ${e.message}`; } })()
    };
  } catch(e) { results.salesorder = { error: e.message }; }

  // ── Test 3: Single SO detail — check line item structure ─────────────
  try {
    const listQs = 'limit=1&offset=0';
    const listR = await fetch(`${SQL_HOST}/salesorder?${listQs}`, { headers: buildHeaders('/salesorder', listQs) });
    const listText = await listR.text();
    const listData = JSON.parse(listText);
    const items = listData.data || listData;
    if (items[0]) {
      const docNo = items[0].docno || items[0].id;
      const detailR = await fetch(`${SQL_HOST}/salesorder/${encodeURIComponent(docNo)}`, { headers: buildHeaders(`/salesorder/${encodeURIComponent(docNo)}`) });
      const detailText = await detailR.text();
      results.salesorder_detail = {
        docNo,
        status: detailR.status,
        sample: detailText.slice(0, 1000),
        topLevelFields: (() => { try { const d = JSON.parse(detailText); return Object.keys(d); } catch(e) { return `parse error`; } })()
      };
    }
  } catch(e) { results.salesorder_detail = { error: e.message }; }

  return res.status(200).json({
    message: 'SQL Account field debug — use these field names to fix sync',
    host: SQL_HOST,
    results
  });
}
