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

async function tryFetch(SQL_HOST, path, qs = 'limit=2&offset=0') {
  try {
    const headers = buildHeaders(path, qs);
    const r = await fetch(`${SQL_HOST}${path}?${qs}`, { headers });
    const text = await r.text();
    const isHTML = text.trim().startsWith('<!');
    if (isHTML) return { status: r.status, isHTML: true };
    try {
      const d = JSON.parse(text);
      const items = d.data || (Array.isArray(d) ? d : [d]);
      return {
        status: r.status,
        isHTML: false,
        count: items.length,
        fields: items[0] ? Object.keys(items[0]) : [],
        sample: items[0] || null,
      };
    } catch(e) {
      return { status: r.status, isHTML: false, raw: text.slice(0, 200) };
    }
  } catch(e) {
    return { error: e.message };
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const { SQL_HOST } = process.env;
  const results = {};

  // 1. Check existing DOs — see fields including offsetqty/transferable
  results.deliveryorder = await tryFetch(SQL_HOST, '/deliveryorder');

  // 2. Check a DO that we know exists (DO-00508 from the screenshot)
  // Find its dockey first
  try {
    const qs = 'limit=5&offset=0';
    const headers = buildHeaders('/deliveryorder', qs);
    const r = await fetch(`${SQL_HOST}/deliveryorder?${qs}`, { headers });
    const text = await r.text();
    if (!text.trim().startsWith('<!')) {
      const d = JSON.parse(text);
      const items = d.data || [];
      if (items[0]) {
        // Fetch detail of first DO
        const doKey = items[0].dockey;
        const detailR = await fetch(`${SQL_HOST}/deliveryorder/${doKey}`, {
          headers: buildHeaders(`/deliveryorder/${doKey}`)
        });
        const detailText = await detailR.text();
        if (!detailText.trim().startsWith('<!')) {
          const detail = JSON.parse(detailText);
          const doData = detail.data?.[0];
          results.do_detail = {
            docno: doData?.docno,
            fields: doData ? Object.keys(doData) : [],
            // Key fields for partial DO tracking
            transferable: doData?.transferable,
            docref1: doData?.docref1,
            docref2: doData?.docref2,
            // Line item fields
            lineFields: doData?.sdsdocdetail?.[0] ? Object.keys(doData.sdsdocdetail[0]) : [],
            lineSample: doData?.sdsdocdetail?.[0] || null,
          };
        }
      }
    }
  } catch(e) {
    results.do_detail_error = e.message;
  }

  // 3. Check salesorder offsetqty — key field for partial fulfillment
  // When a DO is created against an SO, SQL updates offsetqty on SO lines
  try {
    // Fetch SO-00312 detail (known active SO from screenshot)
    const qs = 'limit=50&offset=0';
    const headers = buildHeaders('/salesorder', qs);
    const r = await fetch(`${SQL_HOST}/salesorder?${qs}`, { headers });
    const text = await r.text();
    if (!text.trim().startsWith('<!')) {
      const d = JSON.parse(text);
      const items = (d.data || []).filter(s => s.status === 0 && !s.cancelled);
      if (items[0]) {
        const soKey = items[0].dockey;
        const detailR = await fetch(`${SQL_HOST}/salesorder/${soKey}`, {
          headers: buildHeaders(`/salesorder/${soKey}`)
        });
        const detailText = await detailR.text();
        if (!detailText.trim().startsWith('<!')) {
          const detail = JSON.parse(detailText);
          const soData = detail.data?.[0];
          const lineDetail = soData?.sdsdocdetail?.[0];
          results.so_line_balance_fields = {
            docno: soData?.docno,
            lineFields: lineDetail ? Object.keys(lineDetail) : [],
            // These are the key balance fields
            qty:       lineDetail?.qty,       // original qty
            offsetqty: lineDetail?.offsetqty, // qty already fulfilled by DOs
            sqty:      lineDetail?.sqty,      // secondary qty
            suomqty:   lineDetail?.suomqty,   // secondary UOM qty
            balanceQty: lineDetail ? (parseFloat(lineDetail.qty||0) - parseFloat(lineDetail.offsetqty||0)) : null,
          };
        }
      }
    }
  } catch(e) {
    results.so_balance_error = e.message;
  }

  return res.status(200).json({
    message: 'DO and partial fulfillment field debug',
    host: SQL_HOST,
    results
  });
}
