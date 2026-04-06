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

// Fetch single SO detail by dockey
async function fetchSOLines(dockey) {
  const { SQL_HOST } = process.env;
  const endpoint = `/salesorder/${dockey}`;
  const headers = buildHeaders(endpoint);
  try {
    const r = await fetch(`${SQL_HOST}${endpoint}`, { headers });
    const text = await r.text();
    if (!text || text.trim().startsWith('<!')) return [];
    const data = JSON.parse(text);
    if (data.data && data.data[0] && data.data[0].sdsdocdetail) {
      return data.data[0].sdsdocdetail;
    }
    return [];
  } catch (e) { return []; }
}

// CONFIRMED: status integer 0=Active, 1=Closed, 2=Cancelled
// ALSO: docref3 = "DONE" means fulfilled even if status still 0
function isActiveSO(so) {
  if (so.cancelled) return false;
  if (so.status === 1 || so.status === 2) return false;
  // docref3 = "DONE" means order is fulfilled — exclude from open SOs
  if (so.docref3 && so.docref3.toUpperCase().trim() === 'DONE') return false;
  return true;
}

function mapStatus(so) {
  if (so.cancelled) return 'Cancelled';
  if (so.status === 2) return 'Cancelled';
  if (so.status === 1) return 'Closed';
  if (so.docref3 && so.docref3.toUpperCase().trim() === 'DONE') return 'Done';
  return 'Active';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  // ?mode=headers — fast, headers only, no line items (default)
  // ?mode=lines   — slower, fetches line items for active SOs (run from DO server)
  const mode = req.query.mode || 'headers';

  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', e => console.error('Redis error:', e.message));
  await redis.connect();

  try {
    // ── 1. Fetch all SO headers ───────────────────────────────────────────
    const rawSOs = await fetchAllPages('/salesorder');

    // ── 2. Map with confirmed field names ─────────────────────────────────
    const allSOs = rawSOs.map(so => ({
      id:              so.dockey,
      docNo:           so.docno,
      customer:        so.companyname || so.code,
      customerCode:    so.code,
      date:            so.docdate,
      deliveryDate:    so.deliverydate || null,
      deliveryDateRef: so.docref2 || null,  // "DELIVERY DATE: 06/04/2026"
      poRef:           so.docref1 || null,  // customer PO number
      statusNote:      so.docref3 || null,  // "DONE" when fulfilled
      status:          mapStatus(so),
      statusRaw:       so.status,
      amount:          parseFloat(so.docamt || 0),
      agent:           (so.agent && so.agent !== '----') ? so.agent : null,
      cancelled:       so.cancelled || false,
      lastModified:    so.lastmodified || null,
    }));

    // ── 3. Filter to truly active/open SOs only ───────────────────────────
    const activeSOs = allSOs.filter(so => isActiveSO(rawSOs.find(r => r.dockey === so.id)));

    // Store both full list and active-only list
    await redis.set('mazza_so',          JSON.stringify(allSOs));
    await redis.set('mazza_so_active',   JSON.stringify(activeSOs));
    await redis.set('mazza_so_updated',  new Date().toISOString());

    const totalActiveValue = activeSOs.reduce((sum, s) => sum + s.amount, 0);

    // ── HEADERS MODE: return immediately, no line items ───────────────────
    if (mode === 'headers') {
      return res.status(200).json({
        success:          true,
        mode:             'headers',
        totalSOs:         allSOs.length,
        activeSOs:        activeSOs.length,
        closedOrDone:     allSOs.length - activeSOs.length,
        totalActiveValue: `RM ${totalActiveValue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
        updatedAt:        new Date().toISOString(),
        message:          `Synced ${allSOs.length} SOs total, ${activeSOs.length} active/open`,
        hint:             'Run with ?mode=lines on DO server to fetch line items',
      });
    }

    // ── LINES MODE: fetch detail lines (slow — run from DO server via cron) 
    const byProduct = {};
    const lineItems = [];

    // Only fetch lines for active SOs, cap at 50 to avoid timeout
    const sosToFetch = activeSOs.slice(0, 50);

    for (const so of sosToFetch) {
      const lines = await fetchSOLines(so.id);
      for (const line of lines) {
        const itemCode = line.itemcode;
        if (!itemCode) continue;
        const qty       = parseFloat(line.qty || 0);
        const unitPrice = parseFloat(line.unitprice || 0);
        const amount    = parseFloat(line.amount || 0);
        const uom       = line.uom || 'UNIT';
        const desc      = line.description || itemCode;
        const delDate   = line.deliverydate || so.deliveryDate;

        lineItems.push({
          docNo: so.docNo, dockey: so.id, itemCode, description: desc,
          uom, balQty: qty, unitPrice, amount, customer: so.customer,
          customerCode: so.customerCode, docDate: so.date,
          deliveryDate: delDate, status: so.status,
        });

        if (!byProduct[itemCode]) {
          byProduct[itemCode] = { itemCode, description: desc, uom,
            unitPrice, totalQty: 0, totalValue: 0, orders: [] };
        }
        byProduct[itemCode].totalQty   += qty;
        byProduct[itemCode].totalValue += amount;
        byProduct[itemCode].orders.push({
          soNo: so.docNo, customer: so.customer, qty, unitPrice,
          date: so.date, deliveryDate: delDate, status: so.status,
        });
      }
    }

    if (lineItems.length > 0) {
      await redis.set('so:lines',         JSON.stringify(lineItems));
      await redis.set('so:by_product',    JSON.stringify(byProduct));
      await redis.set('so:lines_updated', new Date().toISOString());
    }

    return res.status(200).json({
      success:          true,
      mode:             'lines',
      totalSOs:         allSOs.length,
      activeSOs:        activeSOs.length,
      sosFetched:       sosToFetch.length,
      lineItems:        lineItems.length,
      products:         Object.keys(byProduct).length,
      totalActiveValue: `RM ${totalActiveValue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
      updatedAt:        new Date().toISOString(),
    });

  } catch (err) {
    console.error('sync-so error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    await redis.disconnect();
  }
}
