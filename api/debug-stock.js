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
    'x-amz-date': amzDate, 'Content-Type': 'application/json',
    'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0',
  };
}

async function tryEndpoint(SQL_HOST, path, qs = 'limit=2&offset=0') {
  try {
    const headers = buildHeaders(path, qs);
    const r = await fetch(`${SQL_HOST}${path}?${qs}`, { headers });
    const text = await r.text();
    const isHTML = text.trim().startsWith('<!');
    let fields = [];
    let sample = text.slice(0, 300);
    if (!isHTML) {
      try {
        const d = JSON.parse(text);
        const items = d.data || d;
        if (Array.isArray(items) && items[0]) fields = Object.keys(items[0]);
        else if (d && typeof d === 'object') fields = Object.keys(d);
      } catch(e) {}
    }
    return { status: r.status, isHTML, fields, sample };
  } catch(e) {
    return { error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { SQL_HOST } = process.env;

  // Test all possible stock balance endpoints
  const endpoints = [
    '/stockbalance',
    '/stock',
    '/inventory',
    '/stockitem/balance',
    '/itemstock',
    '/stock/balance',
    '/stockvalue',
    '/stock/quantity',
  ];

  const results = {};
  for (const ep of endpoints) {
    results[ep] = await tryEndpoint(SQL_HOST, ep);
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  // Also test SO detail with dockey to confirm line item field names
  try {
    const r = await fetch(`${SQL_HOST}/salesorder/8`, { headers: buildHeaders('/salesorder/8') });
    const text = await r.text();
    let parsed = {};
    try { parsed = JSON.parse(text); } catch(e) {}
    results['so_detail_dockey_8'] = {
      status: r.status,
      topKeys: Object.keys(parsed),
      detailSample: parsed.detail ? parsed.detail.slice(0,2) : parsed,
    };
  } catch(e) {
    results['so_detail_dockey_8'] = { error: e.message };
  }

  return res.status(200).json({ host: SQL_HOST, results });
}
