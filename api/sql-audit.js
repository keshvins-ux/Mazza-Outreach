// api/sql-audit.js
// OCC — SQL Account Full API Audit
// Purpose: Hit every known SQL Account endpoint, dump raw field structure
// so we can design the Postgres schema to mirror it exactly.
// Usage: GET /api/sql-audit?key=OCC_AUDIT_2026
// Returns: Full field map of every endpoint — raw, unfiltered.

import crypto from 'crypto';

function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}
function getSignatureKey(key, d, r, s) {
  return sign(sign(sign(sign(Buffer.from('AWS4' + key), d), r), s), 'aws4_request');
}

function buildHeaders(path, qs = '') {
  const { SQL_ACCESS_KEY, SQL_SECRET_KEY, SQL_HOST, SQL_REGION, SQL_SERVICE } = process.env;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\\.\\d{3}/g, '').slice(0, 15) + 'Z';
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
    'x-amz-date': amzDate,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
  };
}

// Fetch first page only (limit=2) — we only need field structure, not all data
async function fetchSample(endpoint, qs = 'limit=2&offset=0') {
  const { SQL_HOST } = process.env;
  const startMs = Date.now();
  try {
    const headers = buildHeaders(endpoint, qs);
    const url = qs ? `${SQL_HOST}${endpoint}?${qs}` : `${SQL_HOST}${endpoint}`;
    const res = await fetch(url, { headers });
    const statusCode = res.status;
    const rawText = await res.text();
    const durationMs = Date.now() - startMs;

    // Detect HTML error (Cloudflare block, auth failure, etc.)
    if (rawText.trim().startsWith('<')) {
      return {
        status: 'BLOCKED_OR_ERROR',
        httpStatus: statusCode,
        durationMs,
        rawPreview: rawText.slice(0, 300),
        fields: null,
        sampleRecord: null,
        recordCount: null,
        nestedObjects: null,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      return {
        status: 'INVALID_JSON',
        httpStatus: statusCode,
        durationMs,
        rawPreview: rawText.slice(0, 300),
        fields: null,
        sampleRecord: null,
        recordCount: null,
        nestedObjects: null,
      };
    }

    // SQL Account wraps results in { data: [...], total: N } or returns array directly
    const records = parsed.data
      ? (Array.isArray(parsed.data) ? parsed.data : [parsed.data])
      : (Array.isArray(parsed) ? parsed : [parsed]);

    const totalCount = parsed.total ?? parsed.count ?? records.length;

    if (!records || records.length === 0) {
      return {
        status: 'EMPTY',
        httpStatus: statusCode,
        durationMs,
        totalCount: 0,
        fields: null,
        sampleRecord: null,
        nestedObjects: null,
        topLevelKeys: Object.keys(parsed),
      };
    }

    const sample = records[0];

    // Deep field analysis
    const fieldMap = analyseRecord(sample);

    return {
      status: 'OK',
      httpStatus: statusCode,
      durationMs,
      totalCount,
      sampleRecordCount: records.length,
      fields: fieldMap.scalarFields,
      nestedObjects: fieldMap.nestedObjects,
      sampleRecord: sample,
    };

  } catch (err) {
    return {
      status: 'FETCH_ERROR',
      durationMs: Date.now() - startMs,
      error: err.message,
      fields: null,
      sampleRecord: null,
    };
  }
}

// Analyse a single record — extract field names, types, sample values
// and identify nested objects/arrays for separate mapping
function analyseRecord(record, depth = 0) {
  const scalarFields = {};
  const nestedObjects = {};

  for (const [key, value] of Object.entries(record)) {
    if (value === null || value === undefined) {
      scalarFields[key] = { type: 'null', sample: null };
    } else if (Array.isArray(value)) {
      // Nested array — analyse first element
      if (value.length > 0 && typeof value[0] === 'object') {
        nestedObjects[key] = {
          type: 'array_of_objects',
          count: value.length,
          fields: analyseRecord(value[0]).scalarFields,
          nestedObjects: analyseRecord(value[0]).nestedObjects,
          sample: value[0],
        };
      } else {
        scalarFields[key] = {
          type: `array_of_${typeof value[0]}`,
          sample: value.slice(0, 3),
        };
      }
    } else if (typeof value === 'object') {
      // Nested object
      nestedObjects[key] = {
        type: 'object',
        fields: analyseRecord(value).scalarFields,
        sample: value,
      };
    } else {
      // Scalar — infer more specific type
      let inferredType = typeof value;
      if (typeof value === 'string') {
        if (/^\d{4}-\d{2}-\d{2}/.test(value)) inferredType = 'date_string';
        else if (/^\d+\.\d+$/.test(value)) inferredType = 'numeric_string';
        else if (/^\d+$/.test(value)) inferredType = 'integer_string';
      }
      scalarFields[key] = {
        type: inferredType,
        sample: value,
      };
    }
  }

  return { scalarFields, nestedObjects };
}

// Fetch SO detail by dockey — we need to find a real dockey first
async function fetchSODetail(dockey) {
  return fetchSample(`/salesorder/${dockey}`, '');
}

export default async function handler(req, res) {
  // Simple auth guard — audit tool should not be publicly accessible
  const { key } = req.query;
  if (key !== 'OCC_AUDIT_2026') {
    return res.status(401).json({ error: 'Unauthorized. Pass ?key=OCC_AUDIT_2026' });
  }

  const startTime = Date.now();
  const results = {};

  // ── MASTER DATA ENDPOINTS ─────────────────────────────────────────────────

  console.log('[AUDIT] Fetching /customer ...');
  results.customer = await fetchSample('/customer');

  console.log('[AUDIT] Fetching /stockitem ...');
  results.stockitem = await fetchSample('/stockitem');

  // Try supplier endpoint — may not exist in SQL Account
  console.log('[AUDIT] Fetching /supplier ...');
  results.supplier = await fetchSample('/supplier');

  // GL accounts — may be /glaccount or /account
  console.log('[AUDIT] Fetching /glaccount ...');
  results.glaccount = await fetchSample('/glaccount');

  console.log('[AUDIT] Fetching /account ...');
  results.account = await fetchSample('/account');

  // UOM
  console.log('[AUDIT] Fetching /uom ...');
  results.uom = await fetchSample('/uom');

  // ── SALES DOCUMENTS ───────────────────────────────────────────────────────

  console.log('[AUDIT] Fetching /salesorder ...');
  results.salesorder = await fetchSample('/salesorder');

  // If we got a salesorder, fetch its detail too
  if (results.salesorder.status === 'OK' && results.salesorder.sampleRecord) {
    const dockey = results.salesorder.sampleRecord.dockey;
    if (dockey) {
      console.log(`[AUDIT] Fetching /salesorder/${dockey} (detail) ...`);
      results.salesorder_detail = await fetchSODetail(dockey);
      results.salesorder_detail._dockeySampled = dockey;
    }
  }

  console.log('[AUDIT] Fetching /salesinvoice ...');
  results.salesinvoice = await fetchSample('/salesinvoice');

  // Fetch invoice detail if available
  if (results.salesinvoice.status === 'OK' && results.salesinvoice.sampleRecord) {
    const dockey = results.salesinvoice.sampleRecord.dockey;
    if (dockey) {
      console.log(`[AUDIT] Fetching /salesinvoice/${dockey} (detail) ...`);
      results.salesinvoice_detail = await fetchSample(`/salesinvoice/${dockey}`, '');
      results.salesinvoice_detail._dockeySampled = dockey;
    }
  }

  console.log('[AUDIT] Fetching /deliveryorder ...');
  results.deliveryorder = await fetchSample('/deliveryorder');

  // Fetch DO detail if available
  if (results.deliveryorder.status === 'OK' && results.deliveryorder.sampleRecord) {
    const dockey = results.deliveryorder.sampleRecord.dockey;
    if (dockey) {
      console.log(`[AUDIT] Fetching /deliveryorder/${dockey} (detail) ...`);
      results.deliveryorder_detail = await fetchSample(`/deliveryorder/${dockey}`, '');
      results.deliveryorder_detail._dockeySampled = dockey;
    }
  }

  // Receipt Vouchers — try multiple possible endpoint names
  console.log('[AUDIT] Fetching /salesreceiptvoucher ...');
  results.salesreceiptvoucher = await fetchSample('/salesreceiptvoucher');

  console.log('[AUDIT] Fetching /officialreceipt ...');
  results.officialreceipt = await fetchSample('/officialreceipt');

  console.log('[AUDIT] Fetching /receiptvoucher ...');
  results.receiptvoucher = await fetchSample('/receiptvoucher');

  // ── PURCHASE DOCUMENTS ────────────────────────────────────────────────────

  console.log('[AUDIT] Fetching /purchaseorder ...');
  results.purchaseorder = await fetchSample('/purchaseorder');

  console.log('[AUDIT] Fetching /goodsreceivednotice ...');
  results.goodsreceivednotice = await fetchSample('/goodsreceivednotice');

  console.log('[AUDIT] Fetching /grn ...');
  results.grn = await fetchSample('/grn');

  console.log('[AUDIT] Fetching /purchaseinvoice ...');
  results.purchaseinvoice = await fetchSample('/purchaseinvoice');

  console.log('[AUDIT] Fetching /supplierpayment ...');
  results.supplierpayment = await fetchSample('/supplierpayment');

  console.log('[AUDIT] Fetching /paymentvoucher ...');
  results.paymentvoucher = await fetchSample('/paymentvoucher');

  // ── INVENTORY ─────────────────────────────────────────────────────────────

  console.log('[AUDIT] Fetching /stockbalance ...');
  results.stockbalance = await fetchSample('/stockbalance');

  console.log('[AUDIT] Fetching /stockadjustment ...');
  results.stockadjustment = await fetchSample('/stockadjustment');

  // ── FINANCIAL ─────────────────────────────────────────────────────────────

  console.log('[AUDIT] Fetching /journalentry ...');
  results.journalentry = await fetchSample('/journalentry');

  console.log('[AUDIT] Fetching /generalledger ...');
  results.generalledger = await fetchSample('/generalledger');

  // ── SUMMARY ───────────────────────────────────────────────────────────────

  const summary = {};
  for (const [endpoint, result] of Object.entries(results)) {
    summary[endpoint] = {
      status: result.status,
      httpStatus: result.httpStatus,
      durationMs: result.durationMs,
      totalCount: result.totalCount ?? null,
      fieldCount: result.fields ? Object.keys(result.fields).length : null,
      nestedObjectKeys: result.nestedObjects ? Object.keys(result.nestedObjects) : null,
      topLevelKeys: result.topLevelKeys ?? null,
    };
  }

  const totalDuration = Date.now() - startTime;

  return res.status(200).json({
    _meta: {
      auditRunAt: new Date().toISOString(),
      totalDurationMs: totalDuration,
      endpointsTested: Object.keys(results).length,
      accessible: Object.values(summary).filter(s => s.status === 'OK').length,
      blocked: Object.values(summary).filter(s => s.status === 'BLOCKED_OR_ERROR').length,
      empty: Object.values(summary).filter(s => s.status === 'EMPTY').length,
      errors: Object.values(summary).filter(s => ['FETCH_ERROR','INVALID_JSON'].includes(s.status)).length,
    },
    summary,
    detail: results,
  });
}
