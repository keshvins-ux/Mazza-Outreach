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
    try { data = JSON.parse(text); } catch (e) { break; }
    const items = data.data || (Array.isArray(data) ? data : []);
    if (!items.length) break;
    all = all.concat(items);
    offset += limit;
    if (all.length > 10000) break;
  }
  return all;
}

// USE dockey (integer) not docno (string) — confirmed by debug
async function fetchSOLines(dockey) {
  const { SQL_HOST } = process.env;
  const endpoint = `/salesorder/${dockey}`;
  const headers = buildHeaders(endpoint);
  try {
    const r = await fetch(`${SQL_HOST}${endpoint}`, { headers });
    const text = await r.text();
    if (!text || text.trim().startsWith('<!')) return [];
    const data = JSON.parse(text);
    return data.detail || data.lines || data.items || data.detailitems || [];
  } catch (e) { return []; }
}

// status is INTEGER: 0=Active, 1=Closed, 2=Cancelled, 3=Draft
function mapStatus(s) {
  return { 0:'Active', 1:'Closed', 2:'Cancelled', 3:'Draft' }[s] ?? `Unknown(${s})`;
}
function isClosed(s) { return s === 1 || s === 2; }

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', e => console.error('Redis error:', e.message));
  await redis.connect();

  try {
    const rawSOs = await fetchAllPages('/salesorder');

    // Map with confirmed field names from debug output
    const soList = rawSOs.map(so => ({
      id:           so.dockey,
      docNo:        so.docno,
      customer:     so.companyname || so.code,
      customerCode: so.code,
      date:         so.docdate,
      deliveryDate: so.deliverydate || null,
      status:       mapStatus(so.status),
      statusRaw:    so.status,
      amount:       parseFloat(so.docamt || 0),  // CONFIRMED field name
      agent:        so.agent !== '----' ? so.agent : null,
      cancelled:    so.cancelled || false,
      lastModified: so.lastmodified || null,
    }));

    await redis.set('mazza_so', JSON.stringify(soList));
    await redis.set('mazza_so_updated', new Date().toISOString());

    // Fetch lines for active SOs using dockey
    const activeSOs = soList
      .filter(so => !so.cancelled && !isClosed(so.statusRaw))
      .slice(0, 150);

    const byProduct = {};
    const lineItems = [];

    for (const so of activeSOs) {
      const lines = await fetchSOLines(so.id); // dockey not docno
      for (const line of lines) {
        const itemCode = line.itemcode || line.code || line.stockcode;
        if (!itemCode) continue;
        const qty       = parseFloat(line.qty || line.quantity || 0);
        const unitPrice = parseFloat(line.unitprice || line.price || 0);
        const uom       = line.uom || 'UNIT';
        const desc      = line.description || line.itemdescription || itemCode;

        lineItems.push({
          docNo: so.docNo, dockey: so.id, itemCode, description: desc,
          uom, balQty: qty, unitPrice, customer: so.customer,
          customerCode: so.customerCode, docDate: so.date,
          deliveryDate: so.deliveryDate, status: so.status,
          amount: qty * unitPrice,
        });

        if (!byProduct[itemCode]) {
          byProduct[itemCode] = { itemCode, description: desc, uom,
            totalQty: 0, totalValue: 0, unitPrice, orders: [] };
        }
        byProduct[itemCode].totalQty   += qty;
        byProduct[itemCode].totalValue += qty * unitPrice;
        byProduct[itemCode].orders.push({
          soNo: so.docNo, customer: so.customer, qty, unitPrice,
          date: so.date, deliveryDate: so.deliveryDate, status: so.status,
        });
      }
    }

    if (lineItems.length > 0) {
      await redis.set('so:lines',         JSON.stringify(lineItems));
      await redis.set('so:by_product',    JSON.stringify(byProduct));
      await redis.set('so:lines_updated', new Date().toISOString());
    }

    const totalValue = soList
      .filter(s => !isClosed(s.statusRaw) && !s.cancelled)
      .reduce((sum, s) => sum + s.amount, 0);

    return res.status(200).json({
      success: true,
      soCount: soList.length,
      activeSOCount: activeSOs.length,
      lineItems: lineItems.length,
      products: Object.keys(byProduct).length,
      totalActiveValue: `RM ${totalValue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
      updatedAt: new Date().toISOString(),
      message: `Synced ${soList.length} SOs, ${lineItems.length} line items`,
    });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    await redis.disconnect();
  }
}
