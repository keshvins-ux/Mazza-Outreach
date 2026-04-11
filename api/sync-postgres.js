// api/sync-postgres.js
// OCC — Incremental Postgres Sync
// One table per call — called by separate crons or manually
//
// Usage:
//   GET /api/sync-postgres?table=salesorders
//   GET /api/sync-postgres?table=deliveryorders
//   GET /api/sync-postgres?table=salesinvoices
//   GET /api/sync-postgres?table=receiptvouchers
//   GET /api/sync-postgres?table=customers
//   GET /api/sync-postgres?table=stockitems
//   GET /api/sync-postgres?table=status   (check last sync times)

import crypto from 'crypto';
import { Pool } from 'pg';

// ── AWS4 SIGNING ───────────────────────────────────────────────
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}
function getSignatureKey(key, d, r, s) {
  return sign(sign(sign(sign(Buffer.from('AWS4' + key), d), r), s), 'aws4_request');
}
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
    'x-amz-date': amzDate,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0',
  };
}

// ── FETCH ──────────────────────────────────────────────────────
async function fetchPage(endpoint, offset, limit = 50) {
  const qs = `limit=${limit}&offset=${offset}`;
  const res = await fetch(`${process.env.SQL_HOST}${endpoint}?${qs}`,
    { headers: buildHeaders(endpoint, qs) });
  const text = await res.text();
  if (text.trim().startsWith('<')) return { blocked: true, records: [] };
  try {
    const data = JSON.parse(text);
    const records = data.data
      ? (Array.isArray(data.data) ? data.data : [data.data])
      : (Array.isArray(data) ? data : []);
    return { blocked: false, records };
  } catch { return { blocked: false, records: [] }; }
}

async function fetchDetail(endpoint, dockey) {
  const path = `${endpoint}/${dockey}`;
  const res = await fetch(`${process.env.SQL_HOST}${path}`,
    { headers: buildHeaders(path) });
  const text = await res.text();
  if (text.trim().startsWith('<')) return null;
  try {
    const data = JSON.parse(text);
    return data.data?.[0] ?? null;
  } catch { return null; }
}

// ── POSTGRES ───────────────────────────────────────────────────
let _pool = null;
function getPool() {
  if (!_pool) _pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
  return _pool;
}
async function q(sql, params = []) {
  const client = await getPool().connect();
  try { return await client.query(sql, params); }
  finally { client.release(); }
}

// ── HELPERS ────────────────────────────────────────────────────
const safe = v => (v === undefined || v === null || v === '----' || v === '') ? null : v;
const safeDate = v => (v && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) ? v.slice(0, 10) : null;

const _periodCache = {};
async function getPeriodId(dateStr) {
  if (!dateStr) return null;
  const code = String(dateStr).slice(0, 7);
  if (_periodCache[code] !== undefined) return _periodCache[code];
  const r = await q('SELECT id FROM occ_periods WHERE period_code = $1', [code]);
  _periodCache[code] = r.rows[0]?.id ?? null;
  return _periodCache[code];
}

async function warmPeriodCache() {
  if (Object.keys(_periodCache).length > 0) return;
  const r = await q('SELECT id, period_code FROM occ_periods');
  for (const row of r.rows) _periodCache[row.period_code] = row.id;
}

// Get last successful sync lastmodified for a table
async function getLastModified(syncType) {
  const r = await q(`
    SELECT last_lastmodified FROM occ_sync_log
    WHERE sync_type = $1 AND status = 'SUCCESS'
    ORDER BY completed_at DESC LIMIT 1
  `, [syncType]);
  return r.rows[0]?.last_lastmodified ?? null;
}

async function logSync(syncType, status, fetched, upserted, lastMod, error, startedAt) {
  try {
    await q(`
      INSERT INTO occ_sync_log
        (sync_type, endpoint, started_at, completed_at, status,
         records_fetched, records_upserted, last_lastmodified, error_message, duration_ms)
      VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8,$9)
    `, [
      syncType, `/${syncType.toLowerCase()}`, startedAt, status,
      fetched, upserted, lastMod, error,
      Date.now() - startedAt.getTime()
    ]);
  } catch(e) { console.error('logSync failed:', e.message); }
}

// ── SALES ORDERS ──────────────────────────────────────────────
async function syncSalesOrders() {
  const started = new Date();
  const lastMod = await getLastModified('SALESORDERS');
  let fetched = 0, upserted = 0, maxMod = lastMod ?? 0;
  const changed = [];

  let offset = 0;
  while (true) {
    const { blocked, records } = await fetchPage('/salesorder', offset);
    if (blocked) { await logSync('SALESORDERS','FAILED',fetched,upserted,maxMod,'Blocked',started); return { error:'Blocked' }; }
    if (!records.length) break;

    for (const r of records) {
      fetched++;
      if (lastMod && r.lastmodified && r.lastmodified <= lastMod) continue;
      try {
        const pid = await getPeriodId(r.docdate);
        await q(`
          INSERT INTO sql_salesorders (
            dockey,docno,docnoex,docdate,postdate,taxdate,
            code,companyname,address1,address2,address3,address4,
            postcode,city,state,country,phone1,mobile,fax1,attention,
            area,agent,project,terms,currencycode,currencyrate,
            shipper,description,cancelled,status,docamt,localdocamt,
            d_docno,d_paymentmethod,d_chequenumber,d_paymentproject,
            d_bankcharge,d_bankchargeaccount,d_amount,
            validity,deliveryterm,cc,docref1,docref2,docref3,docref4,
            branchname,daddress1,daddress2,daddress3,daddress4,
            dpostcode,dcity,dstate,dcountry,dattention,dphone1,dmobile,dfax1,
            taxexemptno,salestaxno,servicetaxno,tin,idtype,idno,
            tourismno,sic,incoterms,submissiontype,peppol_uuid,businessunit,
            attachments,note,approvestate,transferable,updatecount,printcount,
            sql_lastmodified,occ_period_id,occ_synced_at,sql_raw
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
            $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
            $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
            $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
            $71,$72,$73,$74,$75,$76,$77,$78,$79,NOW(),$80
          )
          ON CONFLICT (dockey) DO UPDATE SET
            status=EXCLUDED.status,docamt=EXCLUDED.docamt,cancelled=EXCLUDED.cancelled,
            docref1=EXCLUDED.docref1,docref2=EXCLUDED.docref2,docref3=EXCLUDED.docref3,
            updatecount=EXCLUDED.updatecount,companyname=EXCLUDED.companyname,
            sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW(),
            sql_raw=EXCLUDED.sql_raw
          WHERE sql_salesorders.sql_lastmodified IS NULL
             OR EXCLUDED.sql_lastmodified > sql_salesorders.sql_lastmodified
        `, [
          r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),
          safeDate(r.postdate),safeDate(r.taxdate),
          safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2),
          safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),
          safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),
          safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),
          safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate),
          safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,
          safe(r.docamt),safe(r.localdocamt),safe(r.d_docno),safe(r.d_paymentmethod),
          safe(r.d_chequenumber),safe(r.d_paymentproject),safe(r.d_bankcharge),
          safe(r.d_bankchargeaccount),safe(r.d_amount),safe(r.validity),
          safe(r.deliveryterm),safe(r.cc),
          safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),
          safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3),
          safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),
          safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),
          safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno),
          safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),
          safe(r.sic),safe(r.incoterms),r.submissiontype??null,
          safe(r.peppol_uuid),safe(r.businessunit),
          r.attachments?JSON.stringify(r.attachments):null,
          safe(r.note),safe(r.approvestate),r.transferable??null,
          r.updatecount??null,r.printcount??null,r.lastmodified??null,
          pid,JSON.stringify(r),
        ]);
        upserted++;
        changed.push(r.dockey);
        if (r.lastmodified && r.lastmodified > maxMod) maxMod = r.lastmodified;
      } catch(e) { console.error('SO err dockey='+r.dockey+':',e.message.slice(0,80)); }
    }
    if (records.length < 50) break;
    offset += 50;
    if (offset > 20000) break;
  }

  // Update offsetqty on SO lines for changed SOs (max 5 to stay within time)
  let linesUpdated = 0;
  // Skip line fetching on first run (no lastModified) — lines already migrated
  for (const dockey of (lastMod ? changed.slice(0, 5) : [])) {
    try {
      const detail = await fetchDetail('/salesorder', dockey);
      if (!detail?.sdsdocdetail?.length) continue;
      for (const line of detail.sdsdocdetail) {
        await q(`
          INSERT INTO sql_so_lines (
            dtlkey,dockey,seq,styleid,number,itemcode,location,batch,
            project,description,description2,description3,permitno,
            qty,uom,rate,sqty,suomqty,offsetqty,unitprice,deliverydate,
            disc,tax,tariff,taxexemptionreason,irbm_classification,
            taxrate,taxamt,localtaxamt,exempted_taxrate,exempted_taxamt,
            taxinclusive,amount,localamount,amountwithtax,printable,
            fromdoctype,fromdockey,fromdtlkey,transferable,
            remark1,remark2,companyitemcode,initialpurchasecost,changed
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
            $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
            $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45
          )
          ON CONFLICT (dtlkey) DO UPDATE SET
            offsetqty=EXCLUDED.offsetqty,qty=EXCLUDED.qty,
            unitprice=EXCLUDED.unitprice,amount=EXCLUDED.amount
        `, [
          line.dtlkey,line.dockey,line.seq??null,line.styleid??null,
          safe(line.number),safe(line.itemcode),safe(line.location),safe(line.batch),
          safe(line.project),safe(line.description),safe(line.description2),
          safe(line.description3),safe(line.permitno),
          safe(line.qty),safe(line.uom),safe(line.rate),safe(line.sqty),
          safe(line.suomqty),safe(line.offsetqty),safe(line.unitprice),
          safeDate(line.deliverydate),safe(line.disc),safe(line.tax),
          safe(line.tariff),safe(line.taxexemptionreason),safe(line.irbm_classification),
          safe(line.taxrate),safe(line.taxamt),safe(line.localtaxamt),
          safe(line.exempted_taxrate),safe(line.exempted_taxamt),
          line.taxinclusive??null,safe(line.amount),safe(line.localamount),
          safe(line.amountwithtax),line.printable??null,
          safe(line.fromdoctype),line.fromdockey??null,line.fromdtlkey??null,
          line.transferable??null,safe(line.remark1),safe(line.remark2),
          safe(line.companyitemcode),safe(line.initialpurchasecost),line.changed??null,
        ]);
        linesUpdated++;
      }
    } catch(e) { /* continue */ }
  }

  await logSync('SALESORDERS','SUCCESS',fetched,upserted,maxMod,null,started);
  return { fetched, upserted, linesUpdated, changedCount: changed.length };
}

// ── DELIVERY ORDERS ───────────────────────────────────────────
async function syncDeliveryOrders() {
  const started = new Date();
  const lastMod = await getLastModified('DELIVERYORDERS');
  let fetched = 0, upserted = 0, maxMod = lastMod ?? 0;

  let offset = 0;
  while (true) {
    const { blocked, records } = await fetchPage('/deliveryorder', offset);
    if (blocked) { await logSync('DELIVERYORDERS','FAILED',fetched,upserted,maxMod,'Blocked',started); return { error:'Blocked' }; }
    if (!records.length) break;

    for (const r of records) {
      fetched++;
      if (lastMod && r.lastmodified && r.lastmodified <= lastMod) continue;
      try {
        const pid = await getPeriodId(r.docdate);
        await q(`
          INSERT INTO sql_deliveryorders (
            dockey,docno,docnoex,docdate,postdate,taxdate,
            code,companyname,address1,address2,address3,address4,
            postcode,city,state,country,phone1,mobile,fax1,attention,
            area,agent,project,terms,currencycode,currencyrate,
            shipper,description,cancelled,status,docamt,localdocamt,d_amount,
            validity,deliveryterm,cc,docref1,docref2,docref3,docref4,
            branchname,daddress1,daddress2,daddress3,daddress4,
            dpostcode,dcity,dstate,dcountry,dattention,dphone1,dmobile,dfax1,
            taxexemptno,salestaxno,servicetaxno,tin,idtype,idno,
            tourismno,sic,incoterms,submissiontype,businessunit,
            attachments,note,approvestate,transferable,updatecount,printcount,
            sql_lastmodified,occ_period_id,occ_synced_at,sql_raw
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
            $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
            $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
            $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
            $71,$72,NOW(),$73
          )
          ON CONFLICT (dockey) DO UPDATE SET
            status=EXCLUDED.status,cancelled=EXCLUDED.cancelled,
            docamt=EXCLUDED.docamt,docref1=EXCLUDED.docref1,
            docref2=EXCLUDED.docref2,companyname=EXCLUDED.companyname,
            sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW(),
            sql_raw=EXCLUDED.sql_raw
          WHERE sql_deliveryorders.sql_lastmodified IS NULL
             OR EXCLUDED.sql_lastmodified > sql_deliveryorders.sql_lastmodified
        `, [
          r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),
          safeDate(r.postdate),safeDate(r.taxdate),
          safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2),
          safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),
          safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),
          safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),
          safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate),
          safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,
          safe(r.docamt),safe(r.localdocamt),safe(r.d_amount),safe(r.validity),
          safe(r.deliveryterm),safe(r.cc),
          safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),
          safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3),
          safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),
          safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),
          safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno),
          safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),
          safe(r.sic),safe(r.incoterms),r.submissiontype??null,safe(r.businessunit),
          r.attachments?JSON.stringify(r.attachments):null,
          safe(r.note),safe(r.approvestate),r.transferable??null,
          r.updatecount??null,r.printcount??null,r.lastmodified??null,
          pid,JSON.stringify(r),
        ]);
        upserted++;
        if (r.lastmodified && r.lastmodified > maxMod) maxMod = r.lastmodified;
      } catch(e) { console.error('DO err dockey='+r.dockey+':',e.message.slice(0,80)); }
    }
    if (records.length < 50) break;
    offset += 50;
    if (offset > 30000) break;
  }

  await logSync('DELIVERYORDERS','SUCCESS',fetched,upserted,maxMod,null,started);
  return { fetched, upserted };
}

// ── SALES INVOICES ────────────────────────────────────────────
async function syncSalesInvoices() {
  const started = new Date();
  const lastMod = await getLastModified('SALESINVOICES');
  let fetched = 0, upserted = 0, maxMod = lastMod ?? 0;

  let offset = 0;
  while (true) {
    const { blocked, records } = await fetchPage('/salesinvoice', offset);
    if (blocked) { await logSync('SALESINVOICES','FAILED',fetched,upserted,maxMod,'Blocked',started); return { error:'Blocked' }; }
    if (!records.length) break;

    for (const r of records) {
      fetched++;
      if (lastMod && r.lastmodified && r.lastmodified <= lastMod) continue;
      try {
        const pid = await getPeriodId(r.docdate);
        await q(`
          INSERT INTO sql_salesinvoices (
            dockey,docno,docnoex,docdate,postdate,taxdate,
            eiv_utc,eiv_received_utc,eiv_validated_utc,
            code,companyname,address1,address2,address3,address4,
            postcode,city,state,country,phone1,mobile,fax1,attention,
            area,agent,project,terms,currencycode,currencyrate,
            shipper,description,cancelled,status,docamt,localdocamt,d_amount,
            validity,deliveryterm,cc,docref1,docref2,docref3,docref4,
            branchname,daddress1,daddress2,daddress3,daddress4,
            dpostcode,dcity,dstate,dcountry,dattention,dphone1,dmobile,dfax1,
            taxexemptno,salestaxno,servicetaxno,tin,idtype,idno,
            tourismno,sic,incoterms,submissiontype,
            irbm_status,irbm_internalid,irbm_uuid,irbm_longid,
            eivrequest_uuid,peppol_uuid,peppol_docuuid,businessunit,
            attachments,note,approvestate,transferable,updatecount,printcount,
            sql_lastmodified,occ_period_id,occ_synced_at,sql_raw
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
            $11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
            $21,$22,$23,$24,$25,$26,$27,$28,$29,$30,
            $31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
            $41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
            $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,
            $61,$62,$63,$64,$65,$66,$67,$68,$69,$70,
            $71,$72,$73,$74,$75,$76,$77,$78,$79,$80,NOW(),$81
          )
          ON CONFLICT (dockey) DO UPDATE SET
            status=EXCLUDED.status,cancelled=EXCLUDED.cancelled,
            docamt=EXCLUDED.docamt,companyname=EXCLUDED.companyname,
            sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW(),
            sql_raw=EXCLUDED.sql_raw
          WHERE sql_salesinvoices.sql_lastmodified IS NULL
             OR EXCLUDED.sql_lastmodified > sql_salesinvoices.sql_lastmodified
        `, [
          r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),
          safeDate(r.postdate),safeDate(r.taxdate),
          safe(r.eiv_utc),safe(r.eiv_received_utc),safe(r.eiv_validated_utc),
          safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2),
          safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),
          safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),
          safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),
          safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate),
          safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,
          safe(r.docamt),safe(r.localdocamt),safe(r.d_amount),safe(r.validity),
          safe(r.deliveryterm),safe(r.cc),
          safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),
          safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3),
          safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),
          safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),
          safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno),
          safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),
          safe(r.sic),safe(r.incoterms),r.submissiontype??null,
          r.irbm_status??null,safe(r.irbm_internalid),safe(r.irbm_uuid),
          safe(r.irbm_longid),safe(r.eivrequest_uuid),safe(r.peppol_uuid),
          safe(r.peppol_docuuid),safe(r.businessunit),
          r.attachments?JSON.stringify(r.attachments):null,
          safe(r.note),safe(r.approvestate),r.transferable??null,
          r.updatecount??null,r.printcount??null,r.lastmodified??null,
          pid,JSON.stringify(r),
        ]);
        upserted++;
        if (r.lastmodified && r.lastmodified > maxMod) maxMod = r.lastmodified;
      } catch(e) { console.error('INV err dockey='+r.dockey+':',e.message.slice(0,80)); }
    }
    if (records.length < 50) break;
    offset += 50;
    if (offset > 60000) break;
  }

  await logSync('SALESINVOICES','SUCCESS',fetched,upserted,maxMod,null,started);
  return { fetched, upserted };
}

// ── RECEIPT VOUCHERS ──────────────────────────────────────────
async function syncReceiptVouchers() {
  const started = new Date();
  const lastMod = await getLastModified('RECEIPTVOUCHERS');
  let fetched = 0, upserted = 0, maxMod = lastMod ?? 0;

  let offset = 0;
  while (true) {
    const { blocked, records } = await fetchPage('/receiptvoucher', offset);
    if (blocked) { await logSync('RECEIPTVOUCHERS','FAILED',fetched,upserted,maxMod,'Blocked',started); return { error:'Blocked' }; }
    if (!records.length) break;

    for (const r of records) {
      fetched++;
      if (lastMod && r.lastmodified && r.lastmodified <= lastMod) continue;
      try {
        const pid = await getPeriodId(r.docdate);
        await q(`
          INSERT INTO sql_receiptvouchers (
            dockey,docno,doctype,docdate,postdate,taxdate,
            companyname,description,description2,
            paymentmethod,area,agent,project,journal,chequenumber,
            currencycode,currencyrate,bankcharge,bankchargeaccount,
            docamt,localdocamt,fromdoctype,bounceddate,gltransid,
            cancelled,status,depositkey,fromdoc,
            salestaxno,servicetaxno,tin,idtype,idno,tourismno,sic,
            submissiontype,irbm_status,irbm_internalid,irbm_uuid,irbm_longid,
            peppol_uuid,peppol_docuuid,updatecount,printcount,
            attachments,note,approvestate,sql_lastmodified,
            occ_period_id,occ_synced_at,sql_raw
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
            $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,
            $42,$43,$44,$45,$46,$47,$48,$49,NOW(),$50
          )
          ON CONFLICT (dockey) DO UPDATE SET
            status=EXCLUDED.status,cancelled=EXCLUDED.cancelled,
            docamt=EXCLUDED.docamt,description=EXCLUDED.description,
            sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW(),
            sql_raw=EXCLUDED.sql_raw
          WHERE sql_receiptvouchers.sql_lastmodified IS NULL
             OR EXCLUDED.sql_lastmodified > sql_receiptvouchers.sql_lastmodified
        `, [
          r.dockey,safe(r.docno),safe(r.doctype),safeDate(r.docdate),
          safeDate(r.postdate),safeDate(r.taxdate),
          safe(r.companyname),safe(r.description),safe(r.description2),
          safe(r.paymentmethod),safe(r.area),safe(r.agent),safe(r.project),
          safe(r.journal),safe(r.chequenumber),
          safe(r.currencycode),safe(r.currencyrate),
          safe(r.bankcharge),safe(r.bankchargeaccount),
          safe(r.docamt),safe(r.localdocamt),safe(r.fromdoctype),
          safeDate(r.bounceddate),r.gltransid??null,
          r.cancelled??false,r.status??null,safe(r.depositkey),safe(r.fromdoc),
          safe(r.salestaxno),safe(r.servicetaxno),safe(r.tin),r.idtype??null,
          safe(r.idno),safe(r.tourismno),safe(r.sic),r.submissiontype??null,
          r.irbm_status??null,safe(r.irbm_internalid),safe(r.irbm_uuid),
          safe(r.irbm_longid),safe(r.peppol_uuid),safe(r.peppol_docuuid),
          r.updatecount??null,r.printcount??null,
          r.attachments?JSON.stringify(r.attachments):null,
          safe(r.note),safe(r.approvestate),r.lastmodified??null,
          pid,JSON.stringify(r),
        ]);
        upserted++;
        if (r.lastmodified && r.lastmodified > maxMod) maxMod = r.lastmodified;
      } catch(e) { console.error('RV err dockey='+r.dockey+':',e.message.slice(0,80)); }
    }
    if (records.length < 50) break;
    offset += 50;
    if (offset > 70000) break;
  }

  await logSync('RECEIPTVOUCHERS','SUCCESS',fetched,upserted,maxMod,null,started);
  return { fetched, upserted };
}

// ── CUSTOMERS ─────────────────────────────────────────────────
async function syncCustomers() {
  const started = new Date();
  let fetched = 0, upserted = 0, offset = 0;
  while (true) {
    const { blocked, records } = await fetchPage('/customer', offset);
    if (blocked || !records.length) break;
    for (const r of records) {
      fetched++;
      try {
        await q(`
          INSERT INTO sql_customers (
            code,controlaccount,companyname,companyname2,companycategory,
            area,agent,biznature,creditterm,creditlimit,overduelimit,
            statementtype,currencycode,outstanding,allowexceedcreditlimit,
            addpdctocrlimit,agingon,status,pricetag,creationdate,
            tax,taxexemptno,taxexpdate,brn,brn2,gstno,salestaxno,
            servicetaxno,tin,idtype,idno,tourismno,sic,submissiontype,
            irbm_classification,inforequest_uuid,peppolid,businessunit,
            taxarea,attachments,remark,note,sql_lastmodified,synced_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
            $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,NOW()
          )
          ON CONFLICT (code) DO UPDATE SET
            companyname=EXCLUDED.companyname,outstanding=EXCLUDED.outstanding,
            creditlimit=EXCLUDED.creditlimit,status=EXCLUDED.status,
            sql_lastmodified=EXCLUDED.sql_lastmodified,synced_at=NOW()
          WHERE sql_customers.sql_lastmodified IS NULL
             OR EXCLUDED.sql_lastmodified > sql_customers.sql_lastmodified
        `, [
          safe(r.code),safe(r.controlaccount),safe(r.companyname),safe(r.companyname2),
          safe(r.companycategory),safe(r.area),safe(r.agent),safe(r.biznature),
          safe(r.creditterm),safe(r.creditlimit),safe(r.overduelimit),
          safe(r.statementtype),safe(r.currencycode),safe(r.outstanding),
          r.allowexceedcreditlimit??null,r.addpdctocrlimit??null,
          safe(r.agingon),safe(r.status),safe(r.pricetag),safeDate(r.creationdate),
          safe(r.tax),safe(r.taxexemptno),safeDate(r.taxexpdate),
          safe(r.brn),safe(r.brn2),safe(r.gstno),safe(r.salestaxno),
          safe(r.servicetaxno),safe(r.tin),r.idtype??null,safe(r.idno),
          safe(r.tourismno),safe(r.sic),r.submissiontype??null,
          safe(r.irbm_classification),safe(r.inforequest_uuid),safe(r.peppolid),
          safe(r.businessunit),safe(r.taxarea),
          r.attachments?JSON.stringify(r.attachments):null,
          safe(r.remark),safe(r.note),r.lastmodified??null,
        ]);
        upserted++;
      } catch(e) { /* skip */ }
    }
    if (records.length < 50) break;
    offset += 50;
  }
  await logSync('CUSTOMERS','SUCCESS',fetched,upserted,null,null,started);
  return { fetched, upserted };
}

// ── STOCK ITEMS ───────────────────────────────────────────────
async function syncStockItems() {
  const started = new Date();
  let fetched = 0, upserted = 0, offset = 0;
  while (true) {
    const { blocked, records } = await fetchPage('/stockitem', offset);
    if (blocked || !records.length) break;
    for (const r of records) {
      fetched++;
      try {
        await q(`
          INSERT INTO sql_stockitems (
            dockey,code,description,description2,description3,
            stockgroup,stockcontrol,costingmethod,serialnumber,
            remark1,remark2,minqty,maxqty,reorderlevel,reorderqty,
            shelf,suom,itemtype,leadtime,bom_leadtime,bom_asmcost,
            sltax,phtax,tariff,irbm_classification,stockmatrix,
            defuom_st,defuom_sl,defuom_ph,scriptcode,isactive,
            balsqty,balsuomqty,creationdate,picture,pictureclass,
            attachments,note,sql_lastmodified,synced_at
          ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
            $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
            $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,NOW()
          )
          ON CONFLICT (code) DO UPDATE SET
            description=EXCLUDED.description,isactive=EXCLUDED.isactive,
            balsqty=EXCLUDED.balsqty,sql_lastmodified=EXCLUDED.sql_lastmodified,
            synced_at=NOW()
          WHERE sql_stockitems.sql_lastmodified IS NULL
             OR EXCLUDED.sql_lastmodified > sql_stockitems.sql_lastmodified
        `, [
          r.dockey,safe(r.code),safe(r.description),safe(r.description2),safe(r.description3),
          safe(r.stockgroup),r.stockcontrol??null,r.costingmethod??null,r.serialnumber??null,
          safe(r.remark1),safe(r.remark2),safe(r.minqty),safe(r.maxqty),
          safe(r.reorderlevel),safe(r.reorderqty),safe(r.shelf),safe(r.suom),
          safe(r.itemtype),r.leadtime??null,r.bom_leadtime??null,safe(r.bom_asmcost),
          safe(r.sltax),safe(r.phtax),safe(r.tariff),safe(r.irbm_classification),
          safe(r.stockmatrix),safe(r.defuom_st),safe(r.defuom_sl),safe(r.defuom_ph),
          safe(r.scriptcode),r.isactive??null,safe(r.balsqty),safe(r.balsuomqty),
          safeDate(r.creationdate),safe(r.picture),safe(r.pictureclass),
          r.attachments?JSON.stringify(r.attachments):null,
          safe(r.note),r.lastmodified??null,
        ]);
        upserted++;
      } catch(e) { /* skip */ }
    }
    if (records.length < 50) break;
    offset += 50;
  }
  await logSync('STOCKITEMS','SUCCESS',fetched,upserted,null,null,started);
  return { fetched, upserted };
}

// ── STATUS ────────────────────────────────────────────────────
async function syncStatus() {
  const r = await q(`
    SELECT sync_type, status, completed_at, records_fetched,
           records_upserted, duration_ms, error_message
    FROM occ_sync_log
    WHERE id IN (
      SELECT MAX(id) FROM occ_sync_log GROUP BY sync_type
    )
    ORDER BY sync_type
  `);
  return { lastSyncs: r.rows };
}

// =============================================================
// HANDLER
// =============================================================

// Seed sync log from existing Postgres data (run once after migration)
async function seedSyncLog() {
  const tables = [
    { type: 'SALESORDERS',    table: 'sql_salesorders' },
    { type: 'DELIVERYORDERS', table: 'sql_deliveryorders' },
    { type: 'SALESINVOICES',  table: 'sql_salesinvoices' },
    { type: 'RECEIPTVOUCHERS',table: 'sql_receiptvouchers' },
  ];
  const results = {};
  for (const { type, table } of tables) {
    const r = await q(`
      SELECT COUNT(*) as cnt, MAX(sql_lastmodified) as maxmod
      FROM ${table} WHERE sql_lastmodified IS NOT NULL
    `);
    const { cnt, maxmod } = r.rows[0];
    if (maxmod) {
      await q(`
        INSERT INTO occ_sync_log
          (sync_type, endpoint, started_at, completed_at, status,
           records_fetched, records_upserted, last_lastmodified, duration_ms)
        VALUES ($1,$2,NOW(),NOW(),'SUCCESS',$3,$3,$4,0)
      `, [type, '/'+type.toLowerCase(), parseInt(cnt), parseInt(maxmod)]);
    }
    results[type] = { count: cnt, maxLastModified: maxmod };
  }
  return { seeded: results };
}

export default async function handler(req, res) {
  const { table } = req.query;
  const startTime = Date.now();

  if (!process.env.DATABASE_URL) {
    return res.status(500).json({ error: 'DATABASE_URL not set' });
  }

  try {
    await warmPeriodCache();
    let result;

    switch (table) {
      case 'salesorders':     result = await syncSalesOrders(); break;
      case 'deliveryorders':  result = await syncDeliveryOrders(); break;
      case 'salesinvoices':   result = await syncSalesInvoices(); break;
      case 'receiptvouchers': result = await syncReceiptVouchers(); break;
      case 'customers':       result = await syncCustomers(); break;
      case 'stockitems':      result = await syncStockItems(); break;
      case 'status':          result = await syncStatus(); break;
      case 'seed':            result = await seedSyncLog(); break;
      default:
        return res.status(400).json({
          error: 'Missing ?table= parameter',
          valid: ['salesorders','deliveryorders','salesinvoices','receiptvouchers','customers','stockitems','status','seed']
        });
    }

    return res.status(200).json({
      ok: true, table, durationMs: Date.now() - startTime, ...result
    });

  } catch(e) {
    console.error('sync-postgres error:', e.message);
    return res.status(500).json({ error: e.message, table });
  }
}
