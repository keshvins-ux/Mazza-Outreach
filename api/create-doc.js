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
  let data = {};
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  return { ok: res.ok, status: res.status, data };
}

async function updateRedisLog(soDocno, updates) {
  const redis = createClient({ url: process.env.REDIS_URL });
  await redis.connect();
  const list = JSON.parse(await redis.get('mazza_po_intake') || '[]');
  const idx  = list.findIndex(p => p.docno === soDocno);
  if (idx > -1) Object.assign(list[idx], updates);
  await redis.set('mazza_po_intake', JSON.stringify(list));
  await redis.disconnect();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  if (req.method==='OPTIONS') return res.status(200).end();
  if (req.method!=='POST') return res.status(405).json({ error:'Method not allowed' });

  const { type } = req.query;

  try {
    // ── CREATE SO ──────────────────────────────────────────────────────────
    if (type === 'so') {
      const { soPayload, poMeta } = req.body;
      const { SQL_ACCESS_KEY, SQL_SECRET_KEY, SQL_HOST } = process.env;
      if (!SQL_ACCESS_KEY||!SQL_SECRET_KEY||!SQL_HOST) return res.status(500).json({ error:'Missing SQL env vars' });
      if (!soPayload||!poMeta) return res.status(400).json({ error:'Missing soPayload or poMeta' });
      // Duplicate PO check
      const redis = createClient({ url: process.env.REDIS_URL });
      await redis.connect();
      const existingList = JSON.parse(await redis.get('mazza_po_intake') || '[]');
      const poRef = poMeta.poNumber?.trim().toLowerCase();
      if (poRef) {
        const dup = existingList.find(p => p.poNumber?.trim().toLowerCase()===poRef && p.customerName?.trim().toLowerCase()===poMeta.customerName?.trim().toLowerCase());
        if (dup) { await redis.disconnect(); return res.status(409).json({ error:`Duplicate PO detected! PO "${poMeta.poNumber}" for ${poMeta.customerName} was already submitted by ${dup.submittedBy} on ${new Date(dup.submittedAt).toLocaleString('en-MY')}. SQL SO: ${dup.docno||'unknown'}.`, duplicate:true, existing:{docno:dup.docno,submittedBy:dup.submittedBy,submittedAt:dup.submittedAt} }); }
      }
      await redis.disconnect();
      const { ok, data } = await postToSQL('/salesorder', soPayload);
      if (!ok||data.error) return res.status(400).json({ error: data.error?.message||data.error||data.raw||`SQL error ${ok}` });
      const docno  = data.docno||data.DocNo||data.docNo||data.id||'SO-NEW';
      const dockey = data.dockey||data.DocKey||data.docKey||data.key||null;
      const redis2 = createClient({ url: process.env.REDIS_URL });
      await redis2.connect();
      const list2 = JSON.parse(await redis2.get('mazza_po_intake')||'[]');
      list2.unshift({ ...poMeta, docno, dockey });
      await redis2.set('mazza_po_intake', JSON.stringify(list2.slice(0,200)));
      await redis2.disconnect();
      return res.status(200).json({ docno, dockey, customerName:poMeta.customerName, poNumber:poMeta.poNumber, totalAmount:poMeta.totalAmount, itemCount:(soPayload.sdsdocdetail||[]).length });
    }

    // ── CREATE INVOICE ────────────────────────────────────────────────────
    if (type === 'invoice') {
      const { soDocno, customerCode, deliveryDate, items, description, note } = req.body;
      if (!customerCode||!items?.length) return res.status(400).json({ error:'Missing customerCode or items' });
      // Duplicate check
      const redis = createClient({ url: process.env.REDIS_URL });
      await redis.connect();
      const list = JSON.parse(await redis.get('mazza_po_intake')||'[]');
      await redis.disconnect();
      const existing = soDocno ? list.find(p=>p.docno===soDocno) : null;
      if (existing?.invoiceNo) return res.status(409).json({ duplicate:true, error:`Invoice already created for ${soDocno}`, details:{ soNo:soDocno, invoiceNo:existing.invoiceNo, customer:existing.customerName, createdBy:existing.submittedBy, createdAt:existing.invoicedAt, amount:existing.totalAmount }});
      const today = new Date().toISOString().slice(0,10);
      const payload = { code:customerCode, docdate:today, postdate:today, taxdate:today, description:description||'Sales Invoice', docref1:soDocno||'', docref2:deliveryDate?`DELIVERY DATE: ${deliveryDate}`:'', note:note||'', sdsdocdetail:items.map((item,idx)=>({ itemcode:item.itemcode, description:item.description||item.itemdescription||'', qty:item.qty, uom:item.uom||'UNIT', unitprice:item.unitprice, deliverydate:deliveryDate||today, disc:'', tax:'', taxamt:0, taxrate:null, taxinclusive:false, seq:(idx+1)*1000 })) };
      const { ok, data } = await postToSQL('/salesinvoice', payload);
      if (!ok||data.error) return res.status(400).json({ error:data.error?.message||data.error||data.raw||`SQL error` });
      const docno  = data.docno||data.DocNo||data.id||'IV-NEW';
      const dockey = data.dockey||data.DocKey||null;
      if (soDocno) await updateRedisLog(soDocno, { invoiceNo:docno, invoiceKey:dockey, invoicedAt:new Date().toISOString() });
      return res.status(200).json({ docno, dockey, type:'invoice' });
    }

    // ── CREATE DO ─────────────────────────────────────────────────────────
    if (type === 'do') {
      const { soDocno, customerCode, deliveryDate, items, description, note } = req.body;
      if (!customerCode||!items?.length) return res.status(400).json({ error:'Missing customerCode or items' });
      // Duplicate check
      const redis = createClient({ url: process.env.REDIS_URL });
      await redis.connect();
      const list = JSON.parse(await redis.get('mazza_po_intake')||'[]');
      await redis.disconnect();
      const existing = soDocno ? list.find(p=>p.docno===soDocno) : null;
      if (existing?.doNo) return res.status(409).json({ duplicate:true, error:`Delivery Order already created for ${soDocno}`, details:{ soNo:soDocno, doNo:existing.doNo, customer:existing.customerName, createdBy:existing.submittedBy, createdAt:existing.doCreatedAt, deliveryDate:existing.deliveryDate, amount:existing.totalAmount }});
      const today  = new Date().toISOString().slice(0,10);
      const delDate = deliveryDate||today;
      const payload = { code:customerCode, docdate:today, postdate:today, taxdate:today, description:description||'Delivery Order', docref1:soDocno||'', docref2:`DELIVERY DATE: ${delDate.split('-').reverse().join('/')}`, note:note||'', sdsdocdetail:items.map((item,idx)=>({ itemcode:item.itemcode, description:item.description||item.itemdescription||'', qty:item.qty, uom:item.uom||'UNIT', unitprice:item.unitprice, deliverydate:delDate, disc:'', tax:'', taxamt:0, taxrate:null, taxinclusive:false, seq:(idx+1)*1000 })) };
      const { ok, data } = await postToSQL('/deliveryorder', payload);
      if (!ok||data.error) return res.status(400).json({ error:data.error?.message||data.error||data.raw||`SQL error` });
      const docno  = data.docno||data.DocNo||data.id||'DO-NEW';
      const dockey = data.dockey||data.DocKey||null;
      if (soDocno) await updateRedisLog(soDocno, { doNo:docno, doKey:dockey, doCreatedAt:new Date().toISOString(), deliveryDate:delDate });
      return res.status(200).json({ docno, dockey, type:'do' });
    }

    return res.status(400).json({ error:'Unknown type. Use ?type=so|invoice|do' });

  } catch(err) {
    console.error('create-doc error:', err);
    return res.status(500).json({ error:err.message });
  }
}
