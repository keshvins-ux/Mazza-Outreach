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

// CONFIRMED: use dockey (integer), returns data[0].sdsdocdetail for line items
async function fetchSOLines(dockey) {
  const { SQL_HOST } = process.env;
  const endpoint = `/salesorder/${dockey}`;
  const headers = buildHeaders(endpoint);
  try {
    const r = await fetch(`${SQL_HOST}${endpoint}`, { headers });
    const text = await r.text();
    if (!text || text.trim().startsWith('<!')) return [];
    const data = JSON.parse(text);
    // CONFIRMED field: data[0].sdsdocdetail
    if (data.data && data.data[0] && data.data[0].sdsdocdetail) {
      return data.data[0].sdsdocdetail;
    }
    // fallbacks just in case
    return data.detail || data.lines || data.items || [];
  } catch (e) {
    console.error(`fetchSOLines(${dockey}) error:`, e.message);
    return [];
  }
}

// CONFIRMED: status is integer — 0=Active, 1=Closed, 2=Cancelled, 3=Draft
function mapStatus(s) {
  return { 0: 'Active', 1: 'Closed', 2: 'Cancelled', 3: 'Draft' }[s] ?? `Unknown(${s})`;
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
    // ── 1. Fetch all SO headers ───────────────────────────────────────────
    const rawSOs = await fetchAllPages('/salesorder');

    // ── 2. Map with CONFIRMED field names ─────────────────────────────────
    const soList = rawSOs.map(so => ({
      id:           so.dockey,                 // integer — use for detail lookup
      docNo:        so.docno,                  // "SO-00003"
      customer:     so.companyname || so.code, // "KENNY HILLS BAKERS SDN BHD"
      customerCode: so.code,                   // "300-K002"
      date:         so.docdate,                // "2026-01-23"
      deliveryDate: so.deliverydate || null,
      status:       mapStatus(so.status),      // integer → string
      statusRaw:    so.status,
      amount:       parseFloat(so.docamt || 0), // CONFIRMED: "docamt"
      agent:        (so.agent && so.agent !== '----') ? so.agent : null,
      cancelled:    so.cancelled || false,
      lastModified: so.lastmodified || null,
      // Extract delivery date from docref2 if not in main field
      // CONFIRMED: docref2 = "DELIVERY DATE: 27/01/2026", docref3 = "DONE"
      deliveryDateRef: so.docref2 || null,
      statusNote:   so.docref3 || null,
    }));

    await redis.set('mazza_so', JSON.stringify(soList));
    await redis.set('mazza_so_updated', new Date().toISOString());

    // ── 3. Fetch line items for active SOs ────────────────────────────────
    const activeSOs = soList
      .filter(so => !so.cancelled && !isClosed(so.statusRaw))
      .slice(0, 150); // cap at 150 to stay within Vercel 60s limit

    const byProduct = {};
    const lineItems = [];

    for (const so of activeSOs) {
      // CONFIRMED: use dockey integer, lines are in data[0].sdsdocdetail
      const lines = await fetchSOLines(so.id);

      for (const line of lines) {
        // CONFIRMED field names from sdsdocdetail
        const itemCode  = line.itemcode;
        if (!itemCode) continue;

        const qty       = parseFloat(line.qty || 0);       // confirmed: "2" (string)
        const unitPrice = parseFloat(line.unitprice || 0); // confirmed: "3.8"
        const amount    = parseFloat(line.amount || 0);    // confirmed: "7.6"
        const uom       = line.uom || 'UNIT';              // confirmed: "UNIT"
        const desc      = line.description || itemCode;    // confirmed: "BAY LEAF 250GM"
        const delDate   = line.deliverydate || so.deliveryDate; // confirmed: "2026-01-24"

        lineItems.push({
          docNo:       so.docNo,
          dockey:      so.id,
          itemCode,
          description: desc,
          uom,
          balQty:      qty,
          unitPrice,
          amount,
          customer:    so.customer,
          customerCode: so.customerCode,
          docDate:     so.date,
          deliveryDate: delDate,
          status:      so.status,
        });

        if (!byProduct[itemCode]) {
          byProduct[itemCode] = {
            itemCode,
            description: desc,
            uom,
            unitPrice,
            totalQty:   0,
            totalValue: 0,
            orders:     [],
          };
        }
        byProduct[itemCode].totalQty   += qty;
        byProduct[itemCode].totalValue += amount;
        byProduct[itemCode].orders.push({
          soNo:        so.docNo,
          customer:    so.customer,
          qty,
          unitPrice,
          date:        so.date,
          deliveryDate: delDate,
          status:      so.status,
        });
      }
    }

    if (lineItems.length > 0) {
      await redis.set('so:lines',         JSON.stringify(lineItems));
      await redis.set('so:by_product',    JSON.stringify(byProduct));
      await redis.set('so:lines_updated', new Date().toISOString());
    }

    // ── 4. Summary ────────────────────────────────────────────────────────
    const totalValue = soList
      .filter(s => !isClosed(s.statusRaw) && !s.cancelled)
      .reduce((sum, s) => sum + s.amount, 0);

    return res.status(200).json({
      success:         true,
      soCount:         soList.length,
      activeSOCount:   activeSOs.length,
      lineItems:       lineItems.length,
      products:        Object.keys(byProduct).length,
      totalActiveValue: `RM ${totalValue.toLocaleString('en-MY', { minimumFractionDigits: 2 })}`,
      updatedAt:       new Date().toISOString(),
      message:         `Synced ${soList.length} SOs (${activeSOs.length} active), ${lineItems.length} line items, ${Object.keys(byProduct).length} products`,
    });

  } catch (err) {
    console.error('sync-so error:', err.message);
    return res.status(500).json({ error: err.message });
  } finally {
    await redis.disconnect();
  }
}
