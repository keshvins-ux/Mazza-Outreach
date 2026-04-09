// api/migrate.js v2
// OCC — SQL Account → PostgreSQL Migration (Vercel-hosted)
// Architecture: headers and lines are SEPARATE steps
// PAGE_SIZE=50 throughout — matches SQL Account's minimum page size
//
// STEP ORDER:
// 1. customers, suppliers, stockitems, accounts  (single call each)
// 2. salesorders     page=0,1,2... until done:true
// 3. deliveryorders  page=0,1,2... until done:true
// 4. salesinvoices   page=0,1,2... until done:true
// 5. receiptvouchers page=0,1,2... until done:true
// 6. purchaseorders  page=0,1,2... until done:true
// 7. purchaseinvoices page=0,1,2... until done:true
// 8. supplierpayments page=0,1,2... until done:true
// 9. journalentries  page=0,1,2... until done:true
// 10. solines  (no page — call repeatedly until done:true)
// 11. dolines  (no page — call repeatedly until done:true)
// 12. invlines (no page — call repeatedly until done:true)
// 13. status   (check counts at any time)

import crypto from 'crypto';
import { Pool } from 'pg';

const PAGE_SIZE = 50;

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

// ── SQL ACCOUNT FETCH ──────────────────────────────────────────
async function fetchPage(endpoint, offset) {
  const qs = `limit=${PAGE_SIZE}&offset=${offset}`;
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
  const r = await q(`SELECT id FROM occ_periods WHERE period_code = $1`, [code]);
  _periodCache[code] = r.rows[0]?.id ?? null;
  return _periodCache[code];
}

// ── SHARED HEADER INSERT (SO, DO, INV, PO, PI all share same header structure)
async function insertDocHeader(table, conflictCol, updateFields, r, extraParams, periodId) {
  // This is handled per-function below for clarity — keeping separate inserts
}

// =============================================================
// STATUS
// =============================================================
async function stepStatus() {
  const tables = [
    'sql_customers','sql_suppliers','sql_stockitems','sql_accounts',
    'sql_salesorders','sql_so_lines',
    'sql_deliveryorders','sql_do_lines',
    'sql_salesinvoices','sql_inv_lines',
    'sql_receiptvouchers','sql_purchaseorders',
    'sql_purchaseinvoices','sql_supplierpayments','sql_journalentries',
  ];
  const counts = {};
  for (const t of tables) {
    const r = await q(`SELECT COUNT(*) FROM ${t}`);
    counts[t] = parseInt(r.rows[0].count);
  }
  return { counts };
}

// =============================================================
// MASTER DATA
// =============================================================

async function stepCustomers(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/customer', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
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
          companyname=EXCLUDED.companyname,creditterm=EXCLUDED.creditterm,
          status=EXCLUDED.status,sql_lastmodified=EXCLUDED.sql_lastmodified,synced_at=NOW()
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
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

async function stepSuppliers(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/supplier', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      await q(`
        INSERT INTO sql_suppliers (
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
          companyname=EXCLUDED.companyname,status=EXCLUDED.status,
          sql_lastmodified=EXCLUDED.sql_lastmodified,synced_at=NOW()
        WHERE sql_suppliers.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_suppliers.sql_lastmodified
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
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

async function stepStockItems(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/stockitem', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
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
          balsqty=EXCLUDED.balsqty,sql_lastmodified=EXCLUDED.sql_lastmodified,synced_at=NOW()
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
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

async function stepAccounts(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/account', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      await q(`
        INSERT INTO sql_accounts
          (dockey,parent,code,description,description2,acctype,specialacctype,tax,cashflowtype,sic,synced_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (code) DO UPDATE SET
          description=EXCLUDED.description,acctype=EXCLUDED.acctype,synced_at=NOW()
      `, [
        r.dockey,r.parent??null,safe(r.code),safe(r.description),safe(r.description2),
        safe(r.acctype),safe(r.specialacctype),safe(r.tax),r.cashflowtype??null,safe(r.sic),
      ]);
      upserted++;
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// =============================================================
// SALES ORDERS — headers only, no line fetching
// =============================================================
async function stepSalesOrders(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/salesorder', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
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
          updatecount=EXCLUDED.updatecount,sql_lastmodified=EXCLUDED.sql_lastmodified,
          occ_synced_at=NOW(),sql_raw=EXCLUDED.sql_raw
        WHERE sql_salesorders.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_salesorders.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),        // 1-4
        safeDate(r.postdate),safeDate(r.taxdate),                           // 5-6
        safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2), // 7-10
        safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),    // 11-14
        safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),        // 15-18
        safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),          // 19-22
        safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate), // 23-26
        safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,   // 27-30
        safe(r.docamt),safe(r.localdocamt),safe(r.d_docno),safe(r.d_paymentmethod), // 31-34
        safe(r.d_chequenumber),safe(r.d_paymentproject),safe(r.d_bankcharge),       // 35-37
        safe(r.d_bankchargeaccount),safe(r.d_amount),safe(r.validity),              // 38-40
        safe(r.deliveryterm),safe(r.cc),                                            // 41-42
        safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),           // 43-46
        safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3),  // 47-50
        safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),          // 51-54
        safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),       // 55-58
        safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno), // 59-62
        safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),                 // 63-66
        safe(r.sic),safe(r.incoterms),r.submissiontype??null,                      // 67-69
        safe(r.peppol_uuid),safe(r.businessunit),                                  // 70-71
        r.attachments?JSON.stringify(r.attachments):null,                          // 72
        safe(r.note),safe(r.approvestate),r.transferable??null,                    // 73-75
        r.updatecount??null,r.printcount??null,r.lastmodified??null,               // 76-78
        pid,JSON.stringify(r),                                                      // 79-80
      ]);
      upserted++;
    } catch(e) {
      skipped++;
      if (skipped <= 2) console.error('SO ERR dockey='+r.dockey+':', e.message.slice(0,120));
    }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// SO Lines — call without dockey to get pending list, with dockey to process one
async function stepSoLines(dockey) {
  if (!dockey) {
    const r = await q(`
      SELECT so.dockey FROM sql_salesorders so
      WHERE NOT EXISTS (SELECT 1 FROM sql_so_lines l WHERE l.dockey = so.dockey)
      AND so.docamt != '0' AND so.docamt IS NOT NULL
      ORDER BY so.dockey LIMIT 20
    `);
    return { pending: r.rows.map(x => x.dockey), count: r.rows.length, done: r.rows.length === 0 };
  }
  const detail = await fetchDetail('/salesorder', parseInt(dockey));
  if (!detail) return { dockey, lineCount: 0, error: 'No detail' };
  let lineCount = 0, skipped = 0;
  for (const line of (detail.sdsdocdetail || [])) {
    try {
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
      lineCount++;
    } catch(e) { skipped++; }
  }
  return { dockey, lineCount, skipped };
}

// =============================================================
// DELIVERY ORDERS — headers only
// =============================================================
async function stepDeliveryOrders(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/deliveryorder', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
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
          status=EXCLUDED.status,cancelled=EXCLUDED.cancelled,docamt=EXCLUDED.docamt,
          sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW()
        WHERE sql_deliveryorders.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_deliveryorders.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),        // 1-4
        safeDate(r.postdate),safeDate(r.taxdate),                           // 5-6
        safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2), // 7-10
        safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),    // 11-14
        safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),        // 15-18
        safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),          // 19-22
        safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate), // 23-26
        safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,   // 27-30
        safe(r.docamt),safe(r.localdocamt),safe(r.d_amount),safe(r.validity),    // 31-34
        safe(r.deliveryterm),safe(r.cc),                                         // 35-36
        safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),        // 37-40
        safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3), // 41-44
        safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),         // 45-48
        safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),      // 49-52
        safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno), // 53-56
        safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),                 // 57-60
        safe(r.sic),safe(r.incoterms),r.submissiontype??null,safe(r.businessunit), // 61-64
        r.attachments?JSON.stringify(r.attachments):null,                          // 65
        safe(r.note),safe(r.approvestate),r.transferable??null,                    // 66-68
        r.updatecount??null,r.printcount??null,r.lastmodified??null,               // 69-71
        pid,JSON.stringify(r),                                                      // 72-73
      ]);
      upserted++;
    } catch(e) {
      skipped++;
      if (skipped <= 2) console.error('DO ERR dockey='+r.dockey+':', e.message.slice(0,120));
    }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// DO Lines
async function stepDoLines(dockey) {
  if (!dockey) {
    const r = await q(`
      SELECT do_.dockey FROM sql_deliveryorders do_
      WHERE NOT EXISTS (SELECT 1 FROM sql_do_lines l WHERE l.dockey = do_.dockey)
      AND do_.docamt != '0' AND do_.docamt IS NOT NULL
      ORDER BY do_.dockey LIMIT 20
    `);
    return { pending: r.rows.map(x => x.dockey), count: r.rows.length, done: r.rows.length === 0 };
  }
  const detail = await fetchDetail('/deliveryorder', parseInt(dockey));
  if (!detail) return { dockey, lineCount: 0, error: 'No detail' };
  let lineCount = 0, skipped = 0;
  for (const line of (detail.sdsdocdetail || [])) {
    try {
      await q(`
        INSERT INTO sql_do_lines (
          dtlkey,dockey,seq,styleid,number,itemcode,location,batch,
          project,description,description2,description3,permitno,
          receiveqty,returnqty,qty,uom,rate,sqty,suomqty,
          unitprice,disc,tax,tariff,taxexemptionreason,irbm_classification,
          taxrate,taxamt,localtaxamt,exempted_taxrate,exempted_taxamt,
          taxinclusive,amount,localamount,amountwithtax,printable,
          fromdoctype,fromdockey,fromdtlkey,transferable,
          remark1,remark2,companyitemcode,sdsserialnumber,initialpurchasecost,changed
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
          $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46
        )
        ON CONFLICT (dtlkey) DO UPDATE SET
          qty=EXCLUDED.qty,receiveqty=EXCLUDED.receiveqty,
          fromdockey=EXCLUDED.fromdockey,fromdtlkey=EXCLUDED.fromdtlkey
      `, [
        line.dtlkey,line.dockey,line.seq??null,line.styleid??null,
        safe(line.number),safe(line.itemcode),safe(line.location),safe(line.batch),
        safe(line.project),safe(line.description),safe(line.description2),
        safe(line.description3),safe(line.permitno),
        safe(line.receiveqty),safe(line.returnqty),safe(line.qty),
        safe(line.uom),safe(line.rate),safe(line.sqty),safe(line.suomqty),
        safe(line.unitprice),safe(line.disc),safe(line.tax),safe(line.tariff),
        safe(line.taxexemptionreason),safe(line.irbm_classification),
        safe(line.taxrate),safe(line.taxamt),safe(line.localtaxamt),
        safe(line.exempted_taxrate),safe(line.exempted_taxamt),
        line.taxinclusive??null,safe(line.amount),safe(line.localamount),
        safe(line.amountwithtax),line.printable??null,
        safe(line.fromdoctype),line.fromdockey??null,line.fromdtlkey??null,
        line.transferable??null,safe(line.remark1),safe(line.remark2),
        safe(line.companyitemcode),
        line.sdsserialnumber?JSON.stringify(line.sdsserialnumber):null,
        safe(line.initialpurchasecost),line.changed??null,
      ]);
      lineCount++;
    } catch(e) { skipped++; }
  }
  return { dockey, lineCount, skipped };
}

// =============================================================
// SALES INVOICES — headers only
// =============================================================
async function stepSalesInvoices(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/salesinvoice', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
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
          $71,$72,$73,$74,$75,$76,$77,$78,$79,$80,$81,$82,NOW(),$83
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status=EXCLUDED.status,cancelled=EXCLUDED.cancelled,docamt=EXCLUDED.docamt,
          sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW()
        WHERE sql_salesinvoices.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_salesinvoices.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),          // 1-4
        safeDate(r.postdate),safeDate(r.taxdate),                             // 5-6
        safe(r.eiv_utc),safe(r.eiv_received_utc),safe(r.eiv_validated_utc),  // 7-9
        safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2),  // 10-13
        safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),     // 14-17
        safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),         // 18-21
        safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),           // 22-25
        safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate), // 26-29
        safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,   // 30-33
        safe(r.docamt),safe(r.localdocamt),safe(r.d_amount),safe(r.validity),    // 34-37
        safe(r.deliveryterm),safe(r.cc),                                         // 38-39
        safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),        // 40-43
        safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3), // 44-47
        safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),         // 48-51
        safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),      // 52-55
        safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno), // 56-59
        safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),                 // 60-63
        safe(r.sic),safe(r.incoterms),r.submissiontype??null,                      // 64-66
        r.irbm_status??null,safe(r.irbm_internalid),safe(r.irbm_uuid),            // 67-69
        safe(r.irbm_longid),safe(r.eivrequest_uuid),safe(r.peppol_uuid),          // 70-72
        safe(r.peppol_docuuid),safe(r.businessunit),                              // 73-74
        r.attachments?JSON.stringify(r.attachments):null,                         // 75
        safe(r.note),safe(r.approvestate),r.transferable??null,                   // 76-78
        r.updatecount??null,r.printcount??null,r.lastmodified??null,              // 79-81 (wait — 79,80,81)
        pid,JSON.stringify(r),                                                     // wait recounting below
      ]);
      upserted++;
    } catch(e) {
      skipped++;
      if (skipped <= 2) console.error('INV ERR dockey='+r.dockey+':', e.message.slice(0,120));
    }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// INV Lines
async function stepInvLines(dockey) {
  if (!dockey) {
    const r = await q(`
      SELECT inv.dockey FROM sql_salesinvoices inv
      WHERE NOT EXISTS (SELECT 1 FROM sql_inv_lines l WHERE l.dockey = inv.dockey)
      AND inv.docamt != '0' AND inv.docamt IS NOT NULL
      ORDER BY inv.dockey LIMIT 20
    `);
    return { pending: r.rows.map(x => x.dockey), count: r.rows.length, done: r.rows.length === 0 };
  }
  const detail = await fetchDetail('/salesinvoice', parseInt(dockey));
  if (!detail) return { dockey, lineCount: 0, error: 'No detail' };
  let lineCount = 0, skipped = 0;
  for (const line of (detail.sdsdocdetail || [])) {
    try {
      await q(`
        INSERT INTO sql_inv_lines (
          dtlkey,dockey,seq,styleid,number,itemcode,location,batch,
          project,description,description2,description3,permitno,
          qty,uom,rate,sqty,suomqty,unitprice,deliverydate,
          disc,tax,tariff,taxexemptionreason,irbm_classification,
          taxrate,taxamt,localtaxamt,exempted_taxrate,exempted_taxamt,
          taxinclusive,amount,localamount,taxableamt,amountwithtax,
          account,printable,fromdoctype,fromdockey,fromdtlkey,
          transferable,remark1,remark2,companyitemcode,
          sdsserialnumber,initialpurchasecost,changed
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
          $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
          $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47
        )
        ON CONFLICT (dtlkey) DO UPDATE SET
          qty=EXCLUDED.qty,amount=EXCLUDED.amount,account=EXCLUDED.account
      `, [
        line.dtlkey,line.dockey,line.seq??null,line.styleid??null,
        safe(line.number),safe(line.itemcode),safe(line.location),safe(line.batch),
        safe(line.project),safe(line.description),safe(line.description2),
        safe(line.description3),safe(line.permitno),
        safe(line.qty),safe(line.uom),safe(line.rate),safe(line.sqty),
        safe(line.suomqty),safe(line.unitprice),safeDate(line.deliverydate),
        safe(line.disc),safe(line.tax),safe(line.tariff),
        safe(line.taxexemptionreason),safe(line.irbm_classification),
        safe(line.taxrate),safe(line.taxamt),safe(line.localtaxamt),
        safe(line.exempted_taxrate),safe(line.exempted_taxamt),
        line.taxinclusive??null,safe(line.amount),safe(line.localamount),
        safe(line.taxableamt),safe(line.amountwithtax),safe(line.account),
        line.printable??null,safe(line.fromdoctype),
        line.fromdockey??null,line.fromdtlkey??null,
        line.transferable??null,safe(line.remark1),safe(line.remark2),
        safe(line.companyitemcode),
        line.sdsserialnumber?JSON.stringify(line.sdsserialnumber):null,
        safe(line.initialpurchasecost),line.changed??null,
      ]);
      lineCount++;
    } catch(e) { skipped++; }
  }
  return { dockey, lineCount, skipped };
}

// =============================================================
// RECEIPT VOUCHERS
// =============================================================
async function stepReceiptVouchers(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/receiptvoucher', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
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
          docamt=EXCLUDED.docamt,occ_synced_at=NOW()
        WHERE sql_receiptvouchers.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_receiptvouchers.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safe(r.doctype),safeDate(r.docdate),         // 1-4
        safeDate(r.postdate),safeDate(r.taxdate),                            // 5-6
        safe(r.companyname),safe(r.description),safe(r.description2),       // 7-9
        safe(r.paymentmethod),safe(r.area),safe(r.agent),safe(r.project),   // 10-13
        safe(r.journal),safe(r.chequenumber),                                // 14-15
        safe(r.currencycode),safe(r.currencyrate),                           // 16-17
        safe(r.bankcharge),safe(r.bankchargeaccount),                        // 18-19
        safe(r.docamt),safe(r.localdocamt),safe(r.fromdoctype),             // 20-22
        safeDate(r.bounceddate),r.gltransid??null,                          // 23-24
        r.cancelled??false,r.status??null,safe(r.depositkey),safe(r.fromdoc), // 25-28
        safe(r.salestaxno),safe(r.servicetaxno),safe(r.tin),r.idtype??null, // 29-32
        safe(r.idno),safe(r.tourismno),safe(r.sic),r.submissiontype??null,  // 33-36
        r.irbm_status??null,safe(r.irbm_internalid),safe(r.irbm_uuid),     // 37-39
        safe(r.irbm_longid),safe(r.peppol_uuid),safe(r.peppol_docuuid),    // 40-42
        r.updatecount??null,r.printcount??null,                             // 43-44
        r.attachments?JSON.stringify(r.attachments):null,                   // 45
        safe(r.note),safe(r.approvestate),r.lastmodified??null,             // 46-48
        pid,JSON.stringify(r),                                               // 49-50
      ]);
      upserted++;
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// =============================================================
// PURCHASE ORDERS
// =============================================================
async function stepPurchaseOrders(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/purchaseorder', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const pid = await getPeriodId(r.docdate);
      await q(`
        INSERT INTO sql_purchaseorders (
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
          status=EXCLUDED.status,cancelled=EXCLUDED.cancelled,docamt=EXCLUDED.docamt,
          sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW()
        WHERE sql_purchaseorders.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_purchaseorders.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),        // 1-4
        safeDate(r.postdate),safeDate(r.taxdate),                           // 5-6
        safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2), // 7-10
        safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),   // 11-14
        safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),       // 15-18
        safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),         // 19-22
        safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate), // 23-26
        safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,   // 27-30
        safe(r.docamt),safe(r.localdocamt),safe(r.d_docno),safe(r.d_paymentmethod), // 31-34
        safe(r.d_chequenumber),safe(r.d_paymentproject),safe(r.d_bankcharge),       // 35-37
        safe(r.d_bankchargeaccount),safe(r.d_amount),safe(r.validity),             // 38-40
        safe(r.deliveryterm),safe(r.cc),                                           // 41-42
        safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),         // 43-46
        safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3), // 47-50
        safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),         // 51-54
        safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),      // 55-58
        safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno), // 59-62
        safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),                 // 63-66
        safe(r.sic),safe(r.incoterms),r.submissiontype??null,                      // 67-69
        safe(r.peppol_uuid),safe(r.businessunit),                                  // 70-71
        r.attachments?JSON.stringify(r.attachments):null,                          // 72
        safe(r.note),safe(r.approvestate),r.transferable??null,                    // 73-75
        r.updatecount??null,r.printcount??null,r.lastmodified??null,               // 76-78
        pid,JSON.stringify(r),                                                      // 79-80
      ]);
      upserted++;
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// =============================================================
// PURCHASE INVOICES
// =============================================================
async function stepPurchaseInvoices(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/purchaseinvoice', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const pid = await getPeriodId(r.docdate);
      await q(`
        INSERT INTO sql_purchaseinvoices (
          dockey,docno,docnoex,docdate,postdate,taxdate,
          code,companyname,address1,address2,address3,address4,
          postcode,city,state,country,phone1,mobile,fax1,attention,
          area,agent,project,terms,currencycode,currencyrate,
          shipper,description,cancelled,status,
          docamt,localdocamt,landingcost1,landingcost2,localtotalwithcost,d_amount,
          validity,deliveryterm,cc,docref1,docref2,docref3,docref4,
          branchname,daddress1,daddress2,daddress3,daddress4,
          dpostcode,dcity,dstate,dcountry,dattention,dphone1,dmobile,dfax1,
          taxexemptno,salestaxno,servicetaxno,tin,idtype,idno,
          tourismno,sic,incoterms,submissiontype,
          irbm_status,irbm_internalid,irbm_uuid,irbm_longid,
          peppol_uuid,peppol_docuuid,businessunit,
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
          $71,$72,$73,$74,$75,$76,$77,$78,$79,$80,$81,NOW(),$82
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status=EXCLUDED.status,cancelled=EXCLUDED.cancelled,docamt=EXCLUDED.docamt,
          sql_lastmodified=EXCLUDED.sql_lastmodified,occ_synced_at=NOW()
        WHERE sql_purchaseinvoices.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_purchaseinvoices.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safe(r.docnoex),safeDate(r.docdate),          // 1-4
        safeDate(r.postdate),safeDate(r.taxdate),                             // 5-6
        safe(r.code),safe(r.companyname),safe(r.address1),safe(r.address2),  // 7-10
        safe(r.address3),safe(r.address4),safe(r.postcode),safe(r.city),     // 11-14
        safe(r.state),safe(r.country),safe(r.phone1),safe(r.mobile),         // 15-18
        safe(r.fax1),safe(r.attention),safe(r.area),safe(r.agent),           // 19-22
        safe(r.project),safe(r.terms),safe(r.currencycode),safe(r.currencyrate), // 23-26
        safe(r.shipper),safe(r.description),r.cancelled??false,r.status??null,   // 27-30
        safe(r.docamt),safe(r.localdocamt),safe(r.landingcost1),safe(r.landingcost2), // 31-34
        safe(r.localtotalwithcost),safe(r.d_amount),safe(r.validity),             // 35-37
        safe(r.deliveryterm),safe(r.cc),                                          // 38-39
        safe(r.docref1),safe(r.docref2),safe(r.docref3),safe(r.docref4),         // 40-43
        safe(r.branchname),safe(r.daddress1),safe(r.daddress2),safe(r.daddress3), // 44-47
        safe(r.daddress4),safe(r.dpostcode),safe(r.dcity),safe(r.dstate),         // 48-51
        safe(r.dcountry),safe(r.dattention),safe(r.dphone1),safe(r.dmobile),      // 52-55
        safe(r.dfax1),safe(r.taxexemptno),safe(r.salestaxno),safe(r.servicetaxno), // 56-59
        safe(r.tin),r.idtype??null,safe(r.idno),safe(r.tourismno),                 // 60-63
        safe(r.sic),safe(r.incoterms),r.submissiontype??null,                      // 64-66
        r.irbm_status??null,safe(r.irbm_internalid),safe(r.irbm_uuid),            // 67-69
        safe(r.irbm_longid),safe(r.peppol_uuid),safe(r.peppol_docuuid),           // 70-72
        safe(r.businessunit),                                                      // 73
        r.attachments?JSON.stringify(r.attachments):null,                         // 74
        safe(r.note),safe(r.approvestate),r.transferable??null,                   // 75-77
        r.updatecount??null,r.printcount??null,r.lastmodified??null,              // 78-80
        pid,JSON.stringify(r),                                                     // 81 (wait recounting)
      ]);
      upserted++;
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// =============================================================
// SUPPLIER PAYMENTS
// =============================================================
async function stepSupplierPayments(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/supplierpayment', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const pid = await getPeriodId(r.docdate);
      await q(`
        INSERT INTO sql_supplierpayments (
          dockey,docno,code,docdate,postdate,taxdate,description,
          area,agent,paymentmethod,chequenumber,journal,project,
          paymentproject,currencycode,currencyrate,bankacc,bankcharge,
          bankchargeaccount,docamt,localdocamt,unappliedamt,
          docref1,docref2,fromdoctype,fromdockey,gltransid,
          cancelled,status,nonrefundable,bounceddate,updatecount,
          attachments,note,approvestate,sql_lastmodified,
          banktransfertype,bankrefno,bankstatus,bankstatusdesc,
          occ_period_id,occ_synced_at,sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
          $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,NOW(),$42
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status=EXCLUDED.status,docamt=EXCLUDED.docamt,occ_synced_at=NOW()
        WHERE sql_supplierpayments.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_supplierpayments.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safe(r.code),safeDate(r.docdate),
        safeDate(r.postdate),safeDate(r.taxdate),safe(r.description),
        safe(r.area),safe(r.agent),safe(r.paymentmethod),safe(r.chequenumber),
        safe(r.journal),safe(r.project),safe(r.paymentproject),
        safe(r.currencycode),safe(r.currencyrate),safe(r.bankacc),
        safe(r.bankcharge),safe(r.bankchargeaccount),safe(r.docamt),
        safe(r.localdocamt),safe(r.unappliedamt),safe(r.docref1),safe(r.docref2),
        safe(r.fromdoctype),r.fromdockey??null,r.gltransid??null,
        r.cancelled??false,r.status??null,r.nonrefundable??null,
        safeDate(r.bounceddate),r.updatecount??null,
        r.attachments?JSON.stringify(r.attachments):null,
        safe(r.note),safe(r.approvestate),r.lastmodified??null,
        r.banktransfertype??null,safe(r.bankrefno),safe(r.bankstatus),
        safe(r.bankstatusdesc),pid,JSON.stringify(r),
      ]);
      upserted++;
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// =============================================================
// JOURNAL ENTRIES
// =============================================================
async function stepJournalEntries(page) {
  const offset = page * PAGE_SIZE;
  const { blocked, records } = await fetchPage('/journalentry', offset);
  if (blocked) return { error: 'Blocked' };
  if (!records.length) return { upserted: 0, skipped: 0, done: true };

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const pid = await getPeriodId(r.docdate);
      await q(`
        INSERT INTO sql_journalentries (
          dockey,docno,docdate,postdate,taxdate,journal,description,
          currencycode,currencyrate,gltransid,cancelled,status,
          updatecount,printcount,attachments,note,approvestate,
          fromdoctype,fromdockey,sql_lastmodified,occ_period_id,occ_synced_at,sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),$22
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status=EXCLUDED.status,occ_synced_at=NOW()
        WHERE sql_journalentries.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_journalentries.sql_lastmodified
      `, [
        r.dockey,safe(r.docno),safeDate(r.docdate),safeDate(r.postdate),
        safeDate(r.taxdate),safe(r.journal),safe(r.description),
        safe(r.currencycode),safe(r.currencyrate),r.gltransid??null,
        r.cancelled??false,r.status??null,r.updatecount??null,r.printcount??null,
        r.attachments?JSON.stringify(r.attachments):null,
        safe(r.note),safe(r.approvestate),safe(r.fromdoctype),
        r.fromdockey??null,r.lastmodified??null,pid,JSON.stringify(r),
      ]);
      upserted++;
    } catch(e) { skipped++; }
  }
  const done = records.length < PAGE_SIZE;
  return { page, upserted, skipped, done, nextPage: done ? null : page + 1 };
}

// =============================================================
// MAIN HANDLER
// =============================================================
export default async function handler(req, res) {
  const { key, step, page: pageStr, dockey } = req.query;

  if (key !== 'OCC_MIGRATE_2026') return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.DATABASE_URL) return res.status(500).json({ error: 'DATABASE_URL not set' });

  const page = parseInt(pageStr ?? '0');

  // Pre-load all periods into cache — eliminates DB round trip per record
  if (Object.keys(_periodCache).length === 0) {
    const pr = await q(`SELECT id, period_code FROM occ_periods`);
    for (const row of pr.rows) _periodCache[row.period_code] = row.id;
  }
  const started = Date.now();

  try {
    let result;
    switch (step) {
      case 'status':           result = await stepStatus(); break;
      case 'customers':        result = await stepCustomers(page); break;
      case 'suppliers':        result = await stepSuppliers(page); break;
      case 'stockitems':       result = await stepStockItems(page); break;
      case 'accounts':         result = await stepAccounts(page); break;
      case 'salesorders':      result = await stepSalesOrders(page); break;
      case 'deliveryorders':   result = await stepDeliveryOrders(page); break;
      case 'salesinvoices':    result = await stepSalesInvoices(page); break;
      case 'receiptvouchers':  result = await stepReceiptVouchers(page); break;
      case 'purchaseorders':   result = await stepPurchaseOrders(page); break;
      case 'purchaseinvoices': result = await stepPurchaseInvoices(page); break;
      case 'supplierpayments': result = await stepSupplierPayments(page); break;
      case 'journalentries':   result = await stepJournalEntries(page); break;
      case 'solines':          result = await stepSoLines(dockey); break;
      case 'dolines':          result = await stepDoLines(dockey); break;
      case 'invlines':         result = await stepInvLines(dockey); break;
      default:
        return res.status(400).json({ error: 'Unknown step. Valid steps: status, customers, suppliers, stockitems, accounts, salesorders, deliveryorders, salesinvoices, receiptvouchers, purchaseorders, purchaseinvoices, supplierpayments, journalentries, solines, dolines, invlines' });
    }
    return res.status(200).json({ step, page, durationMs: Date.now() - started, ...result });
  } catch(e) {
    return res.status(500).json({ error: e.message, step, page });
  }
}
