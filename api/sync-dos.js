import crypto from 'crypto';
import { createClient } from 'redis';

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
    try { data = JSON.parse(text); } catch { break; }
    const items = data.data || (Array.isArray(data) ? data : []);
    if (!items.length) break;
    all = all.concat(items);
    offset += limit;
    if (all.length > 5000) break; // safety cap
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', e => console.error('Redis error:', e.message));
  await redis.connect();

  try {
    // Fetch delivery orders from SQL Account
    const rawDOs = await fetchAllPages('/deliveryorder');

    // Map to OCC format — standardised fields for DocumentTracker
    const dos = rawDOs
      .filter(d => !d.cancelled)
      .map(d => {
        // Extract SO reference from docref fields
        // OCC writes: docref1 = PO number, docref2 = "SO-00320 | SKU:qty/total"
        // Legacy: docref1 may contain SO number for old DOs
        // We try to extract the SO number from docref2 first (OCC format)
        let soRef = null;
        if (d.docref2) {
          // OCC format: "SO-00320 | CP-002:2/10, TP-001:5/50"
          const soMatch = d.docref2.match(/^(SO-\d+)/);
          if (soMatch) soRef = soMatch[1];
        }
        // Fallback: check if docref1 looks like an SO number
        if (!soRef && d.docref1 && /^SO-\d+/.test(d.docref1.trim())) {
          soRef = d.docref1.trim().split(/\s/)[0]; // take first word in case of "SO-00320 | ..."
        }

        return {
          id:           d.docno,
          dockey:       d.dockey,
          customer:     d.companyname || d.code || '—',
          code:         d.code,
          date:         d.docdate,
          deliveryDate: d.docref2?.match(/DEL:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1] || null,
          amount:       parseFloat(d.docamt || 0),
          cancelled:    d.cancelled || false,
          // soRef: links this DO back to its parent SO — critical for DocumentTracker
          soRef,
        };
      });

    await redis.set('mazza_do', JSON.stringify(dos));
    await redis.set('mazza_do_updated', new Date().toISOString());

    return res.status(200).json({
      success:   true,
      total:     dos.length,
      withSORef: dos.filter(d => d.soRef).length,
      updatedAt: new Date().toISOString(),
      note:      dos.filter(d => !d.soRef).length + ' DOs have no SO reference (created before OCC or manually in SQL)',
    });

  } catch (err) {
    console.error('sync-dos error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    await redis.disconnect();
  }
}
