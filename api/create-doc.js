import crypto from 'crypto';
import { createClient } from 'redis';

function sign(key, msg) { return crypto.createHmac('sha256', key).update(msg).digest(); }
function getSignatureKey(key, d, r, s) { return sign(sign(sign(sign(Buffer.from('AWS4'+key), d), r), s), 'aws4_request'); }

function buildHeaders(endpoint, bodyStr) {
  const { SQL_ACCESS_KEY, SQL_SECRET_KEY, SQL_HOST, SQL_REGION, SQL_SERVICE } = process.env;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g,'').slice(0,15)+'Z';
  const dateStamp = amzDate.slice(0,8);
  const host = SQL_HOST.replace('https://','');
  const payloadHash = crypto.createHash('sha256').update(bodyStr,'utf8').digest('hex');
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = 'host;x-amz-date';
  const canonicalRequest = ['POST', endpoint, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
  const credentialScope = `${dateStamp}/${SQL_REGION}/${SQL_SERVICE}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, crypto.createHash('sha256').update(canonicalRequest,'utf8').digest('hex')].join('\n');
  const signature = crypto.createHmac('sha256', getSignatureKey(SQL_SECRET_KEY,dateStamp,SQL_REGION,SQL_SERVICE)).update(stringToSign).digest('hex');
  return {
    'Authorization': `AWS4-HMAC-SHA256 Credential=${SQL_ACCESS_KEY}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-date': amzDate, 'Content-Type': 'application/json', 'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  };
}

async function postToSQL(endpoint, payload) {
  const bodyStr = JSON.stringify(payload);
  const headers = buildHeaders(endpoint, bodyStr);
  const res = await fetch(`${process.env.SQL_HOST}${endpoint}`, { method:'POST', headers, body:bodyStr });
  const text = await res.text();
  // Check for HTML response (auth failure / WAF block)
  if (text.trim().startsWith('<!') || text.trim().startsWith('<html')) {
    return { ok:false, status:res.status, data:{ error:'SQL Account authentication failed or service unavailable. Please try again.' }, isHTML:true };
  }
  let data = {};
  try { data = JSON.parse(text); } catch { data = { error: `Invalid response from SQL Account: ${text.slice(0,120)}` }; }
  return { ok: res.ok, status: res.status, data };
}

async function getRedisClient() {
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  return redis;
}

// Check if a doc already exists in SQL-synced Redis data
async function checkExistingInSQL(redis, type, soDocno) {
  if (!soDocno) return null;
  if (type === 'invoice') {
    const raw = await redis.get('mazza_invoice');
    const list = raw ? JSON.parse(raw) : [];
    return list.find(iv => iv.soRef === soDocno || iv.docref1 === soDocno) || null;
  }
  if (type === 'do') {
    const raw = await redis.get('mazza_do');
    const list = raw ? JSON.parse(raw) : [];
    return list.find(d => d.soRef === soDocno || d.docref1 === soDocno) || null;
  }
  if (type === 'so') {
    const raw = await redis.get('mazza_so');
    const list = raw ? JSON.parse(raw) : [];
    return list.find(s => s.id === soDocno) || null;
  }
  return null;
}

// Get customer code from mazza_so if not provided
async function resolveCustomerCode(redis, customerCode, soDocno) {
  if (customerCode) return customerCode;
  if (!soDocno) return null;
  const raw = await redis.get('mazza_so');
  const list = raw ? JSON.parse(raw) : [];
  const so = list.find(s => s.id === soDocno);
  return so?.code || so?.customerCode || null;
}

// Update OCC intake log
async function updateOCCLog(redis, soDocno, updates) {
  const list = JSON.parse(await redis.get('mazza_po_intake') || '[]');
  const idx  = list.findIndex(p => p.docno === soDocno);
  if (idx > -1) {
    Object.assign(list[idx], updates);
  } else {
    // SO was not in OCC log — add a minimal entry so it's tracked
    list.unshift({ docno: soDocno, source: 'sql_existing', ...updates, loggedAt: new Date().toISOString() });
  }
  await redis.set('mazza_po_intake', JSON.stringify(list.slice(0,200)));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({ error:'Method not allowed' });

  const { type } = req.query;
  const redis = await getRedisClient();

  try {

    // ── CREATE SO ──────────────────────────────────────────────────────────
    if (type === 'so') {
      const { soPayload, poMeta } = req.body;
      if (!soPayload || !poMeta) return res.status(400).json({ error:'Missing soPayload or poMeta' });

      // 1. Check OCC log for duplicate PO reference
      const occList = JSON.parse(await redis.get('mazza_po_intake') || '[]');
      const poRef   = poMeta.poNumber?.trim().toLowerCase();
      if (poRef) {
        const dup = occList.find(p =>
          p.poNumber?.trim().toLowerCase() === poRef &&
          p.customerName?.trim().toLowerCase() === poMeta.customerName?.trim().toLowerCase()
        );
        if (dup) {
          return res.status(409).json({
            duplicate: true,
            source: 'occ',
            error: `PO "${poMeta.poNumber}" for ${poMeta.customerName} was already submitted on ${new Date(dup.submittedAt).toLocaleString('en-MY')}.`,
            existing: { docno: dup.docno, submittedBy: dup.submittedBy, submittedAt: dup.submittedAt },
          });
        }
      }

      // 2. Post to SQL
      const { ok, data, isHTML } = await postToSQL('/salesorder', soPayload);

      // 3. Handle SQL duplicate (SQL returns error with existing docno)
      if (!ok) {
        const errMsg = data.error?.message || data.error || data.raw || '';
        // SQL Account returns specific error when SO already exists
        const isDuplicate = errMsg.toLowerCase().includes('duplicate') ||
                            errMsg.toLowerCase().includes('already exist') ||
                            errMsg.toLowerCase().includes('docno');
        if (isDuplicate) {
          return res.status(409).json({
            duplicate: true,
            source: 'sql',
            error: `This SO may already exist in SQL Account. ${errMsg}`,
            existing: { docno: data.docno || data.DocNo || null },
          });
        }
        return res.status(400).json({ error: errMsg || 'Failed to create SO in SQL Account' });
      }

      const docno  = data.docno || data.DocNo || data.docNo || data.id || 'SO-NEW';
      const dockey = data.dockey || data.DocKey || data.docKey || null;

      // 4. Log to OCC
      const updatedList = JSON.parse(await redis.get('mazza_po_intake') || '[]');
      updatedList.unshift({ ...poMeta, docno, dockey });
      await redis.set('mazza_po_intake', JSON.stringify(updatedList.slice(0,200)));

      return res.status(200).json({ docno, dockey, customerName: poMeta.customerName, poNumber: poMeta.poNumber, totalAmount: poMeta.totalAmount, itemCount: (soPayload.sdsdocdetail||[]).length });
    }

    // ── CREATE INVOICE ────────────────────────────────────────────────────
    if (type === 'invoice') {
      let { soDocno, customerCode, deliveryDate, items, description, note } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'No items provided' });

      // 1. Resolve customer code
      customerCode = await resolveCustomerCode(redis, customerCode, soDocno);
      if (!customerCode) return res.status(400).json({ error: 'Cannot determine customer code. Please create via PO Intake or ensure SO is synced.' });

      // 2. Check if invoice ALREADY EXISTS in SQL (not just OCC log)
      const sqlExisting = await checkExistingInSQL(redis, 'invoice', soDocno);
      if (sqlExisting) {
        // Invoice exists in SQL — just log it in OCC and return as success
        if (soDocno) await updateOCCLog(redis, soDocno, { invoiceNo: sqlExisting.id, invoiceKey: sqlExisting.dockey, invoicedAt: new Date().toISOString(), source: 'sql_existing' });
        return res.status(200).json({
          docno: sqlExisting.id, dockey: sqlExisting.dockey, type: 'invoice',
          alreadyExisted: true,
          message: `Invoice ${sqlExisting.id} already exists in SQL Account — linked to OCC tracker.`,
        });
      }

      // 3. Check OCC log
      const occList = JSON.parse(await redis.get('mazza_po_intake') || '[]');
      const occEntry = soDocno ? occList.find(p => p.docno === soDocno) : null;
      if (occEntry?.invoiceNo) {
        return res.status(409).json({
          duplicate: true, source: 'occ',
          error: `Invoice ${occEntry.invoiceNo} already created for ${soDocno} via OCC.`,
          details: { soNo: soDocno, invoiceNo: occEntry.invoiceNo, customer: occEntry.customerName, createdAt: occEntry.invoicedAt },
        });
      }

      // 4. Create in SQL
      const today = new Date().toISOString().slice(0,10);
      const payload = {
        code: customerCode, docdate: today, postdate: today, taxdate: today,
        description: description || 'Sales Invoice',
        docref1: soDocno || '', docref2: deliveryDate ? `DELIVERY DATE: ${deliveryDate}` : '',
        note: note || '',
        sdsdocdetail: items.map((item,idx) => ({
          itemcode: item.itemcode, description: item.description || item.itemdescription || '',
          qty: item.qty, uom: item.uom || 'UNIT', unitprice: item.unitprice,
          deliverydate: deliveryDate || today,
          disc: '', tax: '', taxamt: 0, taxrate: null, taxinclusive: false,
          seq: (idx+1)*1000,
        })),
      };

      const { ok, data } = await postToSQL('/salesinvoice', payload);

      // Handle SQL duplicate
      if (!ok) {
        const errMsg = data.error?.message || data.error || '';
        const isDuplicate = errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('already');
        if (isDuplicate) {
          return res.status(409).json({ duplicate: true, source: 'sql', error: `Invoice may already exist in SQL. ${errMsg}` });
        }
        return res.status(400).json({ error: errMsg || 'Failed to create Invoice in SQL Account' });
      }

      const docno  = data.docno || data.DocNo || data.id || 'IV-NEW';
      const dockey = data.dockey || data.DocKey || null;
      if (soDocno) await updateOCCLog(redis, soDocno, { invoiceNo: docno, invoiceKey: dockey, invoicedAt: new Date().toISOString() });

      return res.status(200).json({ docno, dockey, type: 'invoice' });
    }

    // ── CREATE DO ─────────────────────────────────────────────────────────
    if (type === 'do') {
      let { soDocno, customerCode, deliveryDate, items, description, note } = req.body;
      if (!items?.length) return res.status(400).json({ error: 'No items provided' });

      // 1. Resolve customer code
      customerCode = await resolveCustomerCode(redis, customerCode, soDocno);
      if (!customerCode) return res.status(400).json({ error: 'Cannot determine customer code. Please create via PO Intake or ensure SO is synced.' });

      // 2. Check if DO ALREADY EXISTS in SQL
      const sqlExisting = await checkExistingInSQL(redis, 'do', soDocno);
      if (sqlExisting) {
        if (soDocno) await updateOCCLog(redis, soDocno, { doNo: sqlExisting.id, doKey: sqlExisting.dockey, doCreatedAt: new Date().toISOString(), deliveryDate, source: 'sql_existing' });
        return res.status(200).json({
          docno: sqlExisting.id, dockey: sqlExisting.dockey, type: 'do',
          alreadyExisted: true,
          message: `DO ${sqlExisting.id} already exists in SQL Account — linked to OCC tracker.`,
        });
      }

      // 3. Check OCC log
      const occList = JSON.parse(await redis.get('mazza_po_intake') || '[]');
      const occEntry = soDocno ? occList.find(p => p.docno === soDocno) : null;
      if (occEntry?.doNo) {
        return res.status(409).json({
          duplicate: true, source: 'occ',
          error: `DO ${occEntry.doNo} already created for ${soDocno} via OCC.`,
          details: { soNo: soDocno, doNo: occEntry.doNo, customer: occEntry.customerName, createdAt: occEntry.doCreatedAt, deliveryDate: occEntry.deliveryDate },
        });
      }

      // 4. Create in SQL
      const today  = new Date().toISOString().slice(0,10);
      const delDate = deliveryDate || today;
      const payload = {
        code: customerCode, docdate: today, postdate: today, taxdate: today,
        description: description || 'Delivery Order',
        docref1: soDocno || '', docref2: `DELIVERY DATE: ${delDate.split('-').reverse().join('/')}`,
        note: note || '',
        sdsdocdetail: items.map((item,idx) => ({
          itemcode: item.itemcode, description: item.description || item.itemdescription || '',
          qty: item.qty, uom: item.uom || 'UNIT', unitprice: item.unitprice,
          deliverydate: delDate,
          disc: '', tax: '', taxamt: 0, taxrate: null, taxinclusive: false,
          seq: (idx+1)*1000,
        })),
      };

      const { ok, data } = await postToSQL('/deliveryorder', payload);

      if (!ok) {
        const errMsg = data.error?.message || data.error || '';
        const isDuplicate = errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('already');
        if (isDuplicate) {
          return res.status(409).json({ duplicate: true, source: 'sql', error: `DO may already exist in SQL. ${errMsg}` });
        }
        return res.status(400).json({ error: errMsg || 'Failed to create DO in SQL Account' });
      }

      const docno  = data.docno || data.DocNo || data.id || 'DO-NEW';
      const dockey = data.dockey || data.DocKey || null;
      if (soDocno) await updateOCCLog(redis, soDocno, { doNo: docno, doKey: dockey, doCreatedAt: new Date().toISOString(), deliveryDate: delDate });

      return res.status(200).json({ docno, dockey, type: 'do' });
    }

    return res.status(400).json({ error: 'Unknown type. Use ?type=so|invoice|do' });

  } catch(err) {
    console.error('create-doc error:', err);
    return res.status(500).json({ error: err.message });
  } finally {
    await redis.disconnect();
  }
}
