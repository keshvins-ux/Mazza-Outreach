// Syncs customers and stock items from SQL Account to Redis
// Called by: server cron every 30 mins, and manually via dashboard
import crypto from 'crypto';
import { createClient } from 'redis';

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
    'x-amz-date': amzDate, 'Content-Type': 'application/json', 'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
  };
}

async function fetchAllPages(endpoint, dataKey='data') {
  const { SQL_HOST } = process.env;
  let all = [], offset = 0, limit = 200, hasMore = true;
  while (hasMore) {
    const qs = `limit=${limit}&offset=${offset}`;
    const headers = buildHeaders(endpoint, qs);
    const r = await fetch(`${SQL_HOST}${endpoint}?${qs}`, { headers });
    const text = await r.text();
    if (text.trim().startsWith('<!')) break;
    let data;
    try { data = JSON.parse(text); } catch { break; }
    const items = data[dataKey] || data || [];
    if (!Array.isArray(items) || items.length === 0) { hasMore = false; break; }
    all = all.concat(items);
    if (items.length < limit) hasMore = false;
    else offset += limit;
    // Safety cap
    if (all.length > 5000) hasMore = false;
  }
  return all;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');

  // Allow GET (cron / manual trigger) and POST
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();

  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();

  const results = { customers:0, stockItems:0, errors:[] };

  try {
    // ── CUSTOMERS ──────────────────────────────────────────────────────────
    try {
      const rawCustomers = await fetchAllPages('/customer', 'data');
      const customers = rawCustomers
        .filter(c => c.code && c.code !== '----')
        .map(c => ({
          code:    c.code,
          name:    c.companyname || c.name || c.code,
          phone:   c.phone1 || '',
          area:    c.area || '',
          agent:   c.agent || '',
          terms:   c.terms || '',
          active:  !c.cancelled,
        }))
        .sort((a,b) => a.name.localeCompare(b.name));

      await redis.set('mazza_customers', JSON.stringify(customers));
      await redis.set('mazza_customers_updated', new Date().toISOString());
      results.customers = customers.length;
    } catch(e) {
      results.errors.push(`Customers: ${e.message}`);
    }

    // ── STOCK ITEMS ────────────────────────────────────────────────────────
    try {
      // Try /itemmaster first (full item list), fall back to /stockbalance
      let stockItems = [];
      const rawItems = await fetchAllPages('/itemmaster', 'data');
      if (rawItems.length > 0) {
        stockItems = rawItems
          .filter(s => s.code && !s.cancelled)
          .map(s => ({
            code:        s.code,
            description: s.description || s.description2 || s.code,
            uom:         s.uom || 'UNIT',
            unitprice:   parseFloat(s.unitprice || s.salesprice || 0),
            category:    s.category || s.group || '',
            active:      !s.cancelled,
          }))
          .sort((a,b) => a.code.localeCompare(b.code));
      } else {
        // Fallback: derive from stockbalance items
        const stockRaw = await redis.get('mazza_stock_balance');
        const stockBalance = stockRaw ? JSON.parse(stockRaw) : [];
        stockItems = stockBalance.map(s => ({
          code:        s.code,
          description: s.description || s.code,
          uom:         s.uom || 'UNIT',
          unitprice:   0,
          category:    '',
          active:      true,
        }));
      }

      await redis.set('mazza_stockitems', JSON.stringify(stockItems));
      await redis.set('mazza_stockitems_updated', new Date().toISOString());
      results.stockItems = stockItems.length;
    } catch(e) {
      results.errors.push(`StockItems: ${e.message}`);
    }

    const now = new Date().toISOString();
    await redis.set('mazza_master_updated', now);

    return res.status(200).json({
      success: true,
      customers: results.customers,
      stockItems: results.stockItems,
      errors: results.errors,
      updatedAt: now,
    });

  } catch(err) {
    return res.status(500).json({ error: err.message });
  } finally {
    await redis.disconnect();
  }
}
