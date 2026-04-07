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
    // Fetch invoices from SQL Account
    const rawInvoices = await fetchAllPages('/salesinvoice');

    // Map to OCC format — standardised fields for DocumentTracker
    const invoices = rawInvoices
      .filter(iv => !iv.cancelled)
      .map(iv => {
        // Determine payment status
        const docAmt   = parseFloat(iv.docamt || 0);
        const localAmt = parseFloat(iv.localdocamt || 0);
        const outstandingAmt = parseFloat(iv.outstanding || iv.d_amount || 0);
        const isPaid   = outstandingAmt <= 0;

        // Calculate due date from terms (approximate: 30 days from doc date)
        let dueDate = null;
        if (iv.docdate) {
          const d = new Date(iv.docdate);
          d.setDate(d.getDate() + 30);
          dueDate = d.toISOString().slice(0, 10);
        }

        const now = new Date();
        let status = 'Invoiced';
        if (isPaid) {
          status = 'Paid';
        } else if (dueDate && new Date(dueDate) < now) {
          status = 'Overdue';
        }

        return {
          id:          iv.docno,
          dockey:      iv.dockey,
          customer:    iv.companyname || iv.code || '—',
          code:        iv.code,
          date:        iv.docdate,
          dueDate,
          amount:      docAmt,
          outstanding: outstandingAmt,
          status,
          cancelled:   iv.cancelled || false,
          // Key field: soRef links invoice back to its SO
          // SQL Account stores the SO number in docref1 or docref2
          soRef:       iv.docref1 || iv.docref2 || null,
        };
      });

    await redis.set('mazza_invoice', JSON.stringify(invoices));
    await redis.set('mazza_invoice_updated', new Date().toISOString());

    const paid     = invoices.filter(i => i.status === 'Paid').length;
    const overdue  = invoices.filter(i => i.status === 'Overdue').length;
    const invoiced = invoices.filter(i => i.status === 'Invoiced').length;

    return res.status(200).json({
      success:   true,
      total:     invoices.length,
      paid,
      overdue,
      invoiced,
      updatedAt: new Date().toISOString(),
    });

  } catch (err) {
    console.error('sync-invoices error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    await redis.disconnect();
  }
}
