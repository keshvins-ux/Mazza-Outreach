import crypto from 'crypto';

function sign(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }
function getSignatureKey(key, d, r, s) { return sign(sign(sign(sign(Buffer.from('AWS4'+key), d), r), s), 'aws4_request'); }

function buildHeaders(method, path, qs, bodyStr='') {
  const { SQL_ACCESS_KEY, SQL_SECRET_KEY, SQL_HOST, SQL_REGION, SQL_SERVICE } = process.env;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g,'').slice(0,15)+'Z';
  const dateStamp = amzDate.slice(0,8);
  const host = SQL_HOST.replace('https://','');
  const payloadHash = crypto.createHash('sha256').update(bodyStr,'utf8').digest('hex');
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const canonicalRequest = [method, path, qs||'', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credScope = `${dateStamp}/${SQL_REGION}/${SQL_SERVICE}/aws4_request`;
  const sts = ['AWS4-HMAC-SHA256', amzDate, credScope,
    crypto.createHash('sha256').update(canonicalRequest,'utf8').digest('hex')].join('\n');
  const sig = crypto.createHmac('sha256',
    getSignatureKey(SQL_SECRET_KEY,dateStamp,SQL_REGION,SQL_SERVICE)).update(sts).digest('hex');
  return {
    'Authorization': `AWS4-HMAC-SHA256 Credential=${SQL_ACCESS_KEY}/${credScope}, SignedHeaders=${signedHeaders}, Signature=${sig}`,
    'x-amz-date': amzDate, 'Content-Type': 'application/json', 'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
  };
}

async function sqlGet(SQL_HOST, path, qs='') {
  const headers = buildHeaders('GET', path, qs);
  const r = await fetch(`${SQL_HOST}${path}${qs?'?'+qs:''}`, { headers });
  const text = await r.text();
  if (text.trim().startsWith('<!')) return { isHTML: true, status: r.status };
  try { return { status: r.status, data: JSON.parse(text) }; }
  catch { return { status: r.status, raw: text.slice(0,300) }; }
}

export default async function handler(req, res) {
  const { SQL_HOST } = process.env;
  const results = {};

  // 1. Get stock adjustment with line items
  try {
    const r = await sqlGet(SQL_HOST, '/stockadjustment/137');
    const item = r.data?.data?.[0] || r.data;
    results.stockAdjDetail = {
      topFields: Object.keys(item||{}),
      hasLines: !!item?.sdsdocdetail,
      lineFields: item?.sdsdocdetail?.[0] ? Object.keys(item.sdsdocdetail[0]) : [],
      lineSample: JSON.stringify(item?.sdsdocdetail?.[0]).slice(0,500),
    };
  } catch(e) { results.stockAdjDetail = { error: e.message }; }

  // 2. Try GRN with dockey — find first GRN dockey
  try {
    // First get list with pagination
    const list = await sqlGet(SQL_HOST, '/goodsreceivenote', 'offset=0&limit=5');
    results.grnList = { isHTML: list.isHTML, status: list.status, preview: JSON.stringify(list.data||list.raw||'').slice(0,300) };

    // Try fetching by dockey=1
    if (!list.isHTML) {
      const items = list.data?.data || list.data || [];
      const firstKey = items[0]?.dockey;
      if (firstKey) {
        const detail = await sqlGet(SQL_HOST, `/goodsreceivenote/${firstKey}`);
        const item = detail.data?.data?.[0] || detail.data;
        results.grnDetail = {
          fields: Object.keys(item||{}),
          hasLines: !!item?.sdsdocdetail,
          lineFields: item?.sdsdocdetail?.[0] ? Object.keys(item.sdsdocdetail[0]) : [],
          sample: JSON.stringify(item).slice(0,600),
        };
      }
    }
  } catch(e) { results.grnList = { error: e.message }; }

  // 3. Purchase order line items
  try {
    const r = await sqlGet(SQL_HOST, '/purchaseorder/13');
    const item = r.data?.data?.[0] || r.data;
    results.poLines = {
      lineFields: item?.sdsdocdetail?.[0] ? Object.keys(item.sdsdocdetail[0]) : [],
      lineSample: JSON.stringify(item?.sdsdocdetail?.[0]).slice(0,500),
      hasLines: !!item?.sdsdocdetail?.length,
    };
  } catch(e) { results.poLines = { error: e.message }; }

  // 4. Payment voucher lines
  try {
    const r = await sqlGet(SQL_HOST, '/paymentvoucher/7');
    const item = r.data?.data?.[0] || r.data;
    results.pvLines = {
      fields: Object.keys(item||{}),
      hasLines: !!(item?.sdsdocdetail || item?.knockoff),
      knockoffFields: item?.knockoff?.[0] ? Object.keys(item.knockoff[0]) : [],
      knockoffSample: JSON.stringify(item?.knockoff?.[0]||item?.sdsdocdetail?.[0]).slice(0,400),
    };
  } catch(e) { results.pvLines = { error: e.message }; }

  // 5. Supplier invoice / AP invoice
  try {
    const r = await sqlGet(SQL_HOST, '/purchaseinvoice', 'limit=1');
    results.purchaseInvoice = { isHTML: r.isHTML, status: r.status, fields: Object.keys(r.data?.data?.[0]||r.data||{}).slice(0,10) };
  } catch(e) { results.purchaseInvoice = { error: e.message }; }

  return res.status(200).json(results);
}
