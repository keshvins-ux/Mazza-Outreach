#!/usr/bin/env node
// =============================================================
// OCC — SQL Account → PostgreSQL Full Historical Migration
// Run directly on DO server: node migrate-from-sql.js
// No Vercel timeout limits. Takes 10-30 min depending on data volume.
// =============================================================

import crypto from 'crypto';
import pg from 'pg';

const { Pool } = pg;

// ── CONFIG — set these before running ─────────────────────────
const CONFIG = {
  SQL_HOST:       process.env.SQL_HOST       || 'https://api.sql.my',
  SQL_REGION:     process.env.SQL_REGION     || 'ap-southeast-5',
  SQL_SERVICE:    process.env.SQL_SERVICE    || 'sqlaccount',
  SQL_ACCESS_KEY: process.env.SQL_ACCESS_KEY || '',
  SQL_SECRET_KEY: process.env.SQL_SECRET_KEY || '',
  DATABASE_URL:   process.env.DATABASE_URL   || '',
  BATCH_SIZE:     50,    // records per SQL Account API page
  DELAY_MS:       200,   // ms between API calls — be polite to SQL Account
};

if (!CONFIG.SQL_ACCESS_KEY || !CONFIG.SQL_SECRET_KEY || !CONFIG.DATABASE_URL) {
  console.error('ERROR: Missing environment variables.');
  console.error('Run: export SQL_ACCESS_KEY=... SQL_SECRET_KEY=... DATABASE_URL=...');
  process.exit(1);
}

// ── AWS4 SIGNING ───────────────────────────────────────────────
function sign(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest();
}
function getSignatureKey(key, d, r, s) {
  return sign(sign(sign(sign(Buffer.from('AWS4' + key), d), r), s), 'aws4_request');
}
function buildHeaders(path, qs = '') {
  const { SQL_ACCESS_KEY, SQL_SECRET_KEY, SQL_HOST, SQL_REGION, SQL_SERVICE } = CONFIG;
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

// ── SQL ACCOUNT FETCH HELPERS ──────────────────────────────────
async function fetchPage(endpoint, offset = 0) {
  const qs = `limit=${CONFIG.BATCH_SIZE}&offset=${offset}`;
  const headers = buildHeaders(endpoint, qs);
  const url = `${CONFIG.SQL_HOST}${endpoint}?${qs}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (text.trim().startsWith('<')) return { blocked: true, records: [] };
  try {
    const data = JSON.parse(text);
    const records = data.data ? (Array.isArray(data.data) ? data.data : [data.data])
                              : (Array.isArray(data) ? data : []);
    return { blocked: false, records, total: data.total ?? null };
  } catch (e) {
    return { blocked: false, records: [] };
  }
}

async function fetchAllPages(endpoint) {
  let all = [];
  let offset = 0;
  let page = 0;
  while (true) {
    const { blocked, records, total } = await fetchPage(endpoint, offset);
    if (blocked) {
      log(`  ⚠️  ${endpoint} is Cloudflare blocked — skipping`);
      return { blocked: true, records: [] };
    }
    if (!records.length) break;
    all = all.concat(records);
    if (page === 0 && total) process.stdout.write(`  total: ${total} | `);
    process.stdout.write(`page ${++page}(${all.length}) `);
    if (records.length < CONFIG.BATCH_SIZE) break;
    offset += CONFIG.BATCH_SIZE;
    await sleep(CONFIG.DELAY_MS);
  }
  process.stdout.write('\n');
  return { blocked: false, records: all };
}

async function fetchDetail(endpoint, dockey) {
  const path = `${endpoint}/${dockey}`;
  const headers = buildHeaders(path);
  const url = `${CONFIG.SQL_HOST}${path}`;
  const res = await fetch(url, { headers });
  const text = await res.text();
  if (text.trim().startsWith('<')) return null;
  try {
    const data = JSON.parse(text);
    return data.data?.[0] ?? null;
  } catch { return null; }
}

// ── UTILITIES ─────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(msg) { console.log(msg); }

function safe(v) {
  if (v === undefined) return null;
  if (v === '----') return null;
  if (v === '') return null;
  return v ?? null;
}

function safeDate(v) {
  if (!v) return null;
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return v.slice(0, 10);
  return null;
}

function getPeriodCode(dateStr) {
  if (!dateStr) return null;
  return dateStr.slice(0, 7); // '2026-01'
}

// ── POSTGRES POOL ──────────────────────────────────────────────
const pool = new Pool({ connectionString: CONFIG.DATABASE_URL });

async function query(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// Get period_id from period_code
const periodCache = {};
async function getPeriodId(dateStr) {
  const code = getPeriodCode(dateStr);
  if (!code) return null;
  if (periodCache[code]) return periodCache[code];
  const r = await query('SELECT id FROM occ_periods WHERE period_code = $1', [code]);
  const id = r.rows[0]?.id ?? null;
  periodCache[code] = id;
  return id;
}

// ── LOG SYNC RUN ───────────────────────────────────────────────
async function logSync(type, endpoint, status, fetched, upserted, skipped, error, startedAt) {
  await query(`
    INSERT INTO occ_sync_log
      (sync_type, endpoint, started_at, completed_at, status,
       records_fetched, records_upserted, records_skipped, error_message, duration_ms)
    VALUES ($1,$2,$3,NOW(),$4,$5,$6,$7,$8,$9)
  `, [type, endpoint, startedAt, status, fetched, upserted, skipped,
      error, Date.now() - startedAt.getTime()]);
}

// =============================================================
// MIGRATION FUNCTIONS — one per entity
// =============================================================

// ── 1. CUSTOMERS ──────────────────────────────────────────────
async function migrateCustomers() {
  log('\n── CUSTOMERS (/customer) ──────────────────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/customer');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      await query(`
        INSERT INTO sql_customers (
          code, controlaccount, companyname, companyname2, companycategory,
          area, agent, biznature, creditterm, creditlimit, overduelimit,
          statementtype, currencycode, outstanding, allowexceedcreditlimit,
          addpdctocrlimit, agingon, status, pricetag, creationdate,
          tax, taxexemptno, taxexpdate, brn, brn2, gstno, salestaxno,
          servicetaxno, tin, idtype, idno, tourismno, sic, submissiontype,
          irbm_classification, inforequest_uuid, peppolid, businessunit,
          taxarea, attachments, remark, note, sql_lastmodified, synced_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
          $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,NOW()
        )
        ON CONFLICT (code) DO UPDATE SET
          companyname = EXCLUDED.companyname,
          creditterm  = EXCLUDED.creditterm,
          creditlimit = EXCLUDED.creditlimit,
          status      = EXCLUDED.status,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          synced_at   = NOW()
        WHERE sql_customers.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_customers.sql_lastmodified
      `, [
        safe(r.code), safe(r.controlaccount), safe(r.companyname), safe(r.companyname2),
        safe(r.companycategory), safe(r.area), safe(r.agent), safe(r.biznature),
        safe(r.creditterm), safe(r.creditlimit), safe(r.overduelimit),
        safe(r.statementtype), safe(r.currencycode), safe(r.outstanding),
        r.allowexceedcreditlimit ?? null, r.addpdctocrlimit ?? null,
        safe(r.agingon), safe(r.status), safe(r.pricetag), safeDate(r.creationdate),
        safe(r.tax), safe(r.taxexemptno), safeDate(r.taxexpdate),
        safe(r.brn), safe(r.brn2), safe(r.gstno), safe(r.salestaxno),
        safe(r.servicetaxno), safe(r.tin), r.idtype ?? null, safe(r.idno),
        safe(r.tourismno), safe(r.sic), r.submissiontype ?? null,
        safe(r.irbm_classification), safe(r.inforequest_uuid), safe(r.peppolid),
        safe(r.businessunit), safe(r.taxarea),
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.remark), safe(r.note), r.lastmodified ?? null,
      ]);
      upserted++;
    } catch (e) { skipped++; }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('CUSTOMERS', '/customer', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 2. SUPPLIERS ──────────────────────────────────────────────
async function migrateSuppliers() {
  log('\n── SUPPLIERS (/supplier) ──────────────────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/supplier');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      await query(`
        INSERT INTO sql_suppliers (
          code, controlaccount, companyname, companyname2, companycategory,
          area, agent, biznature, creditterm, creditlimit, overduelimit,
          statementtype, currencycode, outstanding, allowexceedcreditlimit,
          addpdctocrlimit, agingon, status, pricetag, creationdate,
          tax, taxexemptno, taxexpdate, brn, brn2, gstno, salestaxno,
          servicetaxno, tin, idtype, idno, tourismno, sic, submissiontype,
          irbm_classification, inforequest_uuid, peppolid, businessunit,
          taxarea, attachments, remark, note, sql_lastmodified, synced_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
          $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,NOW()
        )
        ON CONFLICT (code) DO UPDATE SET
          companyname = EXCLUDED.companyname,
          creditterm  = EXCLUDED.creditterm,
          status      = EXCLUDED.status,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          synced_at   = NOW()
        WHERE sql_suppliers.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_suppliers.sql_lastmodified
      `, [
        safe(r.code), safe(r.controlaccount), safe(r.companyname), safe(r.companyname2),
        safe(r.companycategory), safe(r.area), safe(r.agent), safe(r.biznature),
        safe(r.creditterm), safe(r.creditlimit), safe(r.overduelimit),
        safe(r.statementtype), safe(r.currencycode), safe(r.outstanding),
        r.allowexceedcreditlimit ?? null, r.addpdctocrlimit ?? null,
        safe(r.agingon), safe(r.status), safe(r.pricetag), safeDate(r.creationdate),
        safe(r.tax), safe(r.taxexemptno), safeDate(r.taxexpdate),
        safe(r.brn), safe(r.brn2), safe(r.gstno), safe(r.salestaxno),
        safe(r.servicetaxno), safe(r.tin), r.idtype ?? null, safe(r.idno),
        safe(r.tourismno), safe(r.sic), r.submissiontype ?? null,
        safe(r.irbm_classification), safe(r.inforequest_uuid), safe(r.peppolid),
        safe(r.businessunit), safe(r.taxarea),
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.remark), safe(r.note), r.lastmodified ?? null,
      ]);
      upserted++;
    } catch (e) { skipped++; }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('SUPPLIERS', '/supplier', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 3. STOCK ITEMS ────────────────────────────────────────────
async function migrateStockItems() {
  log('\n── STOCK ITEMS (/stockitem) ───────────────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/stockitem');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      await query(`
        INSERT INTO sql_stockitems (
          dockey, code, description, description2, description3,
          stockgroup, stockcontrol, costingmethod, serialnumber,
          remark1, remark2, minqty, maxqty, reorderlevel, reorderqty,
          shelf, suom, itemtype, leadtime, bom_leadtime, bom_asmcost,
          sltax, phtax, tariff, irbm_classification, stockmatrix,
          defuom_st, defuom_sl, defuom_ph, scriptcode, isactive,
          balsqty, balsuomqty, creationdate, picture, pictureclass,
          attachments, note, sql_lastmodified, synced_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,
          $16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,
          $29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,NOW()
        )
        ON CONFLICT (code) DO UPDATE SET
          description  = EXCLUDED.description,
          stockgroup   = EXCLUDED.stockgroup,
          isactive     = EXCLUDED.isactive,
          balsqty      = EXCLUDED.balsqty,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          synced_at    = NOW()
        WHERE sql_stockitems.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_stockitems.sql_lastmodified
      `, [
        r.dockey, safe(r.code), safe(r.description), safe(r.description2), safe(r.description3),
        safe(r.stockgroup), r.stockcontrol ?? null, r.costingmethod ?? null, r.serialnumber ?? null,
        safe(r.remark1), safe(r.remark2), safe(r.minqty), safe(r.maxqty),
        safe(r.reorderlevel), safe(r.reorderqty), safe(r.shelf), safe(r.suom),
        safe(r.itemtype), r.leadtime ?? null, r.bom_leadtime ?? null, safe(r.bom_asmcost),
        safe(r.sltax), safe(r.phtax), safe(r.tariff), safe(r.irbm_classification),
        safe(r.stockmatrix), safe(r.defuom_st), safe(r.defuom_sl), safe(r.defuom_ph),
        safe(r.scriptcode), r.isactive ?? null, safe(r.balsqty), safe(r.balsuomqty),
        safeDate(r.creationdate), safe(r.picture), safe(r.pictureclass),
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), r.lastmodified ?? null,
      ]);
      upserted++;
    } catch (e) { skipped++; if (skipped <= 3) log(`  ⚠️  stockitem skip: ${e.message.slice(0,80)}`); }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('STOCKITEMS', '/stockitem', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 4. CHART OF ACCOUNTS ──────────────────────────────────────
async function migrateAccounts() {
  log('\n── ACCOUNTS (/account) ────────────────────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/account');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      await query(`
        INSERT INTO sql_accounts (
          dockey, parent, code, description, description2,
          acctype, specialacctype, tax, cashflowtype, sic, synced_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (code) DO UPDATE SET
          description = EXCLUDED.description,
          acctype     = EXCLUDED.acctype,
          synced_at   = NOW()
      `, [
        r.dockey, r.parent ?? null, safe(r.code), safe(r.description), safe(r.description2),
        safe(r.acctype), safe(r.specialacctype), safe(r.tax),
        r.cashflowtype ?? null, safe(r.sic),
      ]);
      upserted++;
    } catch (e) { skipped++; }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('ACCOUNTS', '/account', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 5. SALES ORDERS (headers + lines) ────────────────────────
async function migrateSalesOrders() {
  log('\n── SALES ORDERS (/salesorder) ─────────────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/salesorder');
  if (blocked) return;

  let upserted = 0, skipped = 0, lineCount = 0;

  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_salesorders (
          dockey, docno, docnoex, docdate, postdate, taxdate,
          code, companyname, address1, address2, address3, address4,
          postcode, city, state, country, phone1, mobile, fax1, attention,
          area, agent, project, terms, currencycode, currencyrate,
          shipper, description, cancelled, status, docamt, localdocamt,
          d_docno, d_paymentmethod, d_chequenumber, d_paymentproject,
          d_bankcharge, d_bankchargeaccount, d_amount,
          validity, deliveryterm, cc,
          docref1, docref2, docref3, docref4,
          branchname, daddress1, daddress2, daddress3, daddress4,
          dpostcode, dcity, dstate, dcountry, dattention, dphone1, dmobile, dfax1,
          taxexemptno, salestaxno, servicetaxno, tin, idtype, idno,
          tourismno, sic, incoterms, submissiontype, peppol_uuid, businessunit,
          attachments, note, approvestate, transferable, updatecount, printcount,
          sql_lastmodified, occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,
          $67,$68,$69,$70,$71,$72,$73,$74,$75,NOW(),$76
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status      = EXCLUDED.status,
          docamt      = EXCLUDED.docamt,
          docref1     = EXCLUDED.docref1,
          docref2     = EXCLUDED.docref2,
          docref3     = EXCLUDED.docref3,
          cancelled   = EXCLUDED.cancelled,
          updatecount = EXCLUDED.updatecount,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          occ_synced_at = NOW(),
          sql_raw     = EXCLUDED.sql_raw
        WHERE sql_salesorders.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_salesorders.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safe(r.docnoex), safeDate(r.docdate),
        safeDate(r.postdate), safeDate(r.taxdate),
        safe(r.code), safe(r.companyname), safe(r.address1), safe(r.address2),
        safe(r.address3), safe(r.address4), safe(r.postcode), safe(r.city),
        safe(r.state), safe(r.country), safe(r.phone1), safe(r.mobile),
        safe(r.fax1), safe(r.attention), safe(r.area), safe(r.agent),
        safe(r.project), safe(r.terms), safe(r.currencycode), safe(r.currencyrate),
        safe(r.shipper), safe(r.description), r.cancelled ?? false, r.status ?? null,
        safe(r.docamt), safe(r.localdocamt), safe(r.d_docno), safe(r.d_paymentmethod),
        safe(r.d_chequenumber), safe(r.d_paymentproject), safe(r.d_bankcharge),
        safe(r.d_bankchargeaccount), safe(r.d_amount), safe(r.validity),
        safe(r.deliveryterm), safe(r.cc),
        safe(r.docref1), safe(r.docref2), safe(r.docref3), safe(r.docref4),
        safe(r.branchname), safe(r.daddress1), safe(r.daddress2), safe(r.daddress3),
        safe(r.daddress4), safe(r.dpostcode), safe(r.dcity), safe(r.dstate),
        safe(r.dcountry), safe(r.dattention), safe(r.dphone1), safe(r.dmobile),
        safe(r.dfax1), safe(r.taxexemptno), safe(r.salestaxno), safe(r.servicetaxno),
        safe(r.tin), r.idtype ?? null, safe(r.idno), safe(r.tourismno),
        safe(r.sic), safe(r.incoterms), r.submissiontype ?? null,
        safe(r.peppol_uuid), safe(r.businessunit),
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), r.transferable ?? null,
        r.updatecount ?? null, r.printcount ?? null, r.lastmodified ?? null,
        periodId, JSON.stringify(r),
      ]);
      upserted++;

      // Fetch detail for line items
      await sleep(CONFIG.DELAY_MS);
      const detail = await fetchDetail('/salesorder', r.dockey);
      if (detail?.sdsdocdetail?.length) {
        for (const line of detail.sdsdocdetail) {
          try {
            await query(`
              INSERT INTO sql_so_lines (
                dtlkey, dockey, seq, styleid, number, itemcode, location, batch,
                project, description, description2, description3, permitno,
                qty, uom, rate, sqty, suomqty, offsetqty, unitprice, deliverydate,
                disc, tax, tariff, taxexemptionreason, irbm_classification,
                taxrate, taxamt, localtaxamt, exempted_taxrate, exempted_taxamt,
                taxinclusive, amount, localamount, amountwithtax, printable,
                fromdoctype, fromdockey, fromdtlkey, transferable,
                remark1, remark2, companyitemcode, initialpurchasecost, changed
              ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
                $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45
              )
              ON CONFLICT (dtlkey) DO UPDATE SET
                offsetqty = EXCLUDED.offsetqty,
                qty       = EXCLUDED.qty,
                unitprice = EXCLUDED.unitprice,
                amount    = EXCLUDED.amount,
                changed   = EXCLUDED.changed
            `, [
              line.dtlkey, line.dockey, line.seq ?? null, line.styleid ?? null,
              safe(line.number), safe(line.itemcode), safe(line.location), safe(line.batch),
              safe(line.project), safe(line.description), safe(line.description2),
              safe(line.description3), safe(line.permitno),
              safe(line.qty), safe(line.uom), safe(line.rate), safe(line.sqty),
              safe(line.suomqty), safe(line.offsetqty), safe(line.unitprice),
              safeDate(line.deliverydate), safe(line.disc), safe(line.tax),
              safe(line.tariff), safe(line.taxexemptionreason), safe(line.irbm_classification),
              safe(line.taxrate), safe(line.taxamt), safe(line.localtaxamt),
              safe(line.exempted_taxrate), safe(line.exempted_taxamt),
              line.taxinclusive ?? null, safe(line.amount), safe(line.localamount),
              safe(line.amountwithtax), line.printable ?? null,
              safe(line.fromdoctype), line.fromdockey ?? null, line.fromdtlkey ?? null,
              line.transferable ?? null, safe(line.remark1), safe(line.remark2),
              safe(line.companyitemcode), safe(line.initialpurchasecost), line.changed ?? null,
            ]);
            lineCount++;
          } catch (e) { /* skip bad line */ }
        }
      }
    } catch (e) {
      skipped++;
      if (skipped <= 3) log(`  ⚠️  SO skip dockey=${r.dockey}: ${e.message.slice(0,80)}`);
    }
  }
  log(`  ✅ ${upserted} SOs upserted, ${lineCount} lines, ${skipped} skipped`);
  await logSync('SALESORDERS', '/salesorder', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 6. DELIVERY ORDERS (headers + lines) ─────────────────────
async function migrateDeliveryOrders() {
  log('\n── DELIVERY ORDERS (/deliveryorder) ───────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/deliveryorder');
  if (blocked) return;

  let upserted = 0, skipped = 0, lineCount = 0;

  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_deliveryorders (
          dockey, docno, docnoex, docdate, postdate, taxdate,
          code, companyname, address1, address2, address3, address4,
          postcode, city, state, country, phone1, mobile, fax1, attention,
          area, agent, project, terms, currencycode, currencyrate,
          shipper, description, cancelled, status, docamt, localdocamt, d_amount,
          validity, deliveryterm, cc, docref1, docref2, docref3, docref4,
          branchname, daddress1, daddress2, daddress3, daddress4,
          dpostcode, dcity, dstate, dcountry, dattention, dphone1, dmobile, dfax1,
          taxexemptno, salestaxno, servicetaxno, tin, idtype, idno,
          tourismno, sic, incoterms, submissiontype, businessunit,
          attachments, note, approvestate, transferable, updatecount, printcount,
          sql_lastmodified, occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,
          $67,$68,$69,$70,NOW(),$71
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status    = EXCLUDED.status,
          cancelled = EXCLUDED.cancelled,
          docamt    = EXCLUDED.docamt,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          occ_synced_at = NOW()
        WHERE sql_deliveryorders.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_deliveryorders.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safe(r.docnoex), safeDate(r.docdate),
        safeDate(r.postdate), safeDate(r.taxdate),
        safe(r.code), safe(r.companyname), safe(r.address1), safe(r.address2),
        safe(r.address3), safe(r.address4), safe(r.postcode), safe(r.city),
        safe(r.state), safe(r.country), safe(r.phone1), safe(r.mobile),
        safe(r.fax1), safe(r.attention), safe(r.area), safe(r.agent),
        safe(r.project), safe(r.terms), safe(r.currencycode), safe(r.currencyrate),
        safe(r.shipper), safe(r.description), r.cancelled ?? false, r.status ?? null,
        safe(r.docamt), safe(r.localdocamt), safe(r.d_amount),
        safe(r.validity), safe(r.deliveryterm), safe(r.cc),
        safe(r.docref1), safe(r.docref2), safe(r.docref3), safe(r.docref4),
        safe(r.branchname), safe(r.daddress1), safe(r.daddress2), safe(r.daddress3),
        safe(r.daddress4), safe(r.dpostcode), safe(r.dcity), safe(r.dstate),
        safe(r.dcountry), safe(r.dattention), safe(r.dphone1), safe(r.dmobile),
        safe(r.dfax1), safe(r.taxexemptno), safe(r.salestaxno), safe(r.servicetaxno),
        safe(r.tin), r.idtype ?? null, safe(r.idno), safe(r.tourismno),
        safe(r.sic), safe(r.incoterms), r.submissiontype ?? null, safe(r.businessunit),
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), r.transferable ?? null,
        r.updatecount ?? null, r.printcount ?? null, r.lastmodified ?? null,
        periodId, JSON.stringify(r),
      ]);
      upserted++;

      await sleep(CONFIG.DELAY_MS);
      const detail = await fetchDetail('/deliveryorder', r.dockey);
      if (detail?.sdsdocdetail?.length) {
        for (const line of detail.sdsdocdetail) {
          try {
            await query(`
              INSERT INTO sql_do_lines (
                dtlkey, dockey, seq, styleid, number, itemcode, location, batch,
                project, description, description2, description3, permitno,
                receiveqty, returnqty, qty, uom, rate, sqty, suomqty,
                unitprice, disc, tax, tariff, taxexemptionreason, irbm_classification,
                taxrate, taxamt, localtaxamt, exempted_taxrate, exempted_taxamt,
                taxinclusive, amount, localamount, amountwithtax, printable,
                fromdoctype, fromdockey, fromdtlkey, transferable,
                remark1, remark2, companyitemcode, sdsserialnumber,
                initialpurchasecost, changed
              ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
                $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46
              )
              ON CONFLICT (dtlkey) DO UPDATE SET
                qty         = EXCLUDED.qty,
                receiveqty  = EXCLUDED.receiveqty,
                returnqty   = EXCLUDED.returnqty,
                fromdockey  = EXCLUDED.fromdockey,
                fromdtlkey  = EXCLUDED.fromdtlkey
            `, [
              line.dtlkey, line.dockey, line.seq ?? null, line.styleid ?? null,
              safe(line.number), safe(line.itemcode), safe(line.location), safe(line.batch),
              safe(line.project), safe(line.description), safe(line.description2),
              safe(line.description3), safe(line.permitno),
              safe(line.receiveqty), safe(line.returnqty), safe(line.qty),
              safe(line.uom), safe(line.rate), safe(line.sqty), safe(line.suomqty),
              safe(line.unitprice), safe(line.disc), safe(line.tax), safe(line.tariff),
              safe(line.taxexemptionreason), safe(line.irbm_classification),
              safe(line.taxrate), safe(line.taxamt), safe(line.localtaxamt),
              safe(line.exempted_taxrate), safe(line.exempted_taxamt),
              line.taxinclusive ?? null, safe(line.amount), safe(line.localamount),
              safe(line.amountwithtax), line.printable ?? null,
              safe(line.fromdoctype), line.fromdockey ?? null, line.fromdtlkey ?? null,
              line.transferable ?? null, safe(line.remark1), safe(line.remark2),
              safe(line.companyitemcode),
              line.sdsserialnumber ? JSON.stringify(line.sdsserialnumber) : null,
              safe(line.initialpurchasecost), line.changed ?? null,
            ]);
            lineCount++;
          } catch (e) { /* skip */ }
        }
      }
    } catch (e) {
      skipped++;
      if (skipped <= 3) log(`  ⚠️  DO skip dockey=${r.dockey}: ${e.message.slice(0,80)}`);
    }
  }
  log(`  ✅ ${upserted} DOs upserted, ${lineCount} lines, ${skipped} skipped`);
  await logSync('DELIVERYORDERS', '/deliveryorder', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 7. SALES INVOICES (headers + lines) ──────────────────────
async function migrateSalesInvoices() {
  log('\n── SALES INVOICES (/salesinvoice) ─────────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/salesinvoice');
  if (blocked) return;

  let upserted = 0, skipped = 0, lineCount = 0;

  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_salesinvoices (
          dockey, docno, docnoex, docdate, postdate, taxdate,
          eiv_utc, eiv_received_utc, eiv_validated_utc,
          code, companyname, address1, address2, address3, address4,
          postcode, city, state, country, phone1, mobile, fax1, attention,
          area, agent, project, terms, currencycode, currencyrate,
          shipper, description, cancelled, status, docamt, localdocamt, d_amount,
          validity, deliveryterm, cc, docref1, docref2, docref3, docref4,
          branchname, daddress1, daddress2, daddress3, daddress4,
          dpostcode, dcity, dstate, dcountry, dattention, dphone1, dmobile, dfax1,
          taxexemptno, salestaxno, servicetaxno, tin, idtype, idno,
          tourismno, sic, incoterms, submissiontype,
          irbm_status, irbm_internalid, irbm_uuid, irbm_longid,
          eivrequest_uuid, peppol_uuid, peppol_docuuid, businessunit,
          attachments, note, approvestate, transferable, updatecount, printcount,
          sql_lastmodified, occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,
          $67,$68,$69,$70,$71,$72,$73,$74,$75,$76,$77,$78,$79,NOW(),$80
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status      = EXCLUDED.status,
          cancelled   = EXCLUDED.cancelled,
          docamt      = EXCLUDED.docamt,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          occ_synced_at = NOW()
        WHERE sql_salesinvoices.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_salesinvoices.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safe(r.docnoex), safeDate(r.docdate),
        safeDate(r.postdate), safeDate(r.taxdate),
        safe(r.eiv_utc), safe(r.eiv_received_utc), safe(r.eiv_validated_utc),
        safe(r.code), safe(r.companyname), safe(r.address1), safe(r.address2),
        safe(r.address3), safe(r.address4), safe(r.postcode), safe(r.city),
        safe(r.state), safe(r.country), safe(r.phone1), safe(r.mobile),
        safe(r.fax1), safe(r.attention), safe(r.area), safe(r.agent),
        safe(r.project), safe(r.terms), safe(r.currencycode), safe(r.currencyrate),
        safe(r.shipper), safe(r.description), r.cancelled ?? false, r.status ?? null,
        safe(r.docamt), safe(r.localdocamt), safe(r.d_amount),
        safe(r.validity), safe(r.deliveryterm), safe(r.cc),
        safe(r.docref1), safe(r.docref2), safe(r.docref3), safe(r.docref4),
        safe(r.branchname), safe(r.daddress1), safe(r.daddress2), safe(r.daddress3),
        safe(r.daddress4), safe(r.dpostcode), safe(r.dcity), safe(r.dstate),
        safe(r.dcountry), safe(r.dattention), safe(r.dphone1), safe(r.dmobile),
        safe(r.dfax1), safe(r.taxexemptno), safe(r.salestaxno), safe(r.servicetaxno),
        safe(r.tin), r.idtype ?? null, safe(r.idno), safe(r.tourismno),
        safe(r.sic), safe(r.incoterms), r.submissiontype ?? null,
        r.irbm_status ?? null, safe(r.irbm_internalid), safe(r.irbm_uuid),
        safe(r.irbm_longid), safe(r.eivrequest_uuid), safe(r.peppol_uuid),
        safe(r.peppol_docuuid), safe(r.businessunit),
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), r.transferable ?? null,
        r.updatecount ?? null, r.printcount ?? null, r.lastmodified ?? null,
        periodId, JSON.stringify(r),
      ]);
      upserted++;

      await sleep(CONFIG.DELAY_MS);
      const detail = await fetchDetail('/salesinvoice', r.dockey);
      if (detail?.sdsdocdetail?.length) {
        for (const line of detail.sdsdocdetail) {
          try {
            await query(`
              INSERT INTO sql_inv_lines (
                dtlkey, dockey, seq, styleid, number, itemcode, location, batch,
                project, description, description2, description3, permitno,
                qty, uom, rate, sqty, suomqty, unitprice, deliverydate,
                disc, tax, tariff, taxexemptionreason, irbm_classification,
                taxrate, taxamt, localtaxamt, exempted_taxrate, exempted_taxamt,
                taxinclusive, amount, localamount, taxableamt, amountwithtax,
                account, printable, fromdoctype, fromdockey, fromdtlkey,
                transferable, remark1, remark2, companyitemcode,
                sdsserialnumber, initialpurchasecost, changed
              ) VALUES (
                $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
                $18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,
                $33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47
              )
              ON CONFLICT (dtlkey) DO UPDATE SET
                qty    = EXCLUDED.qty,
                amount = EXCLUDED.amount,
                account = EXCLUDED.account
            `, [
              line.dtlkey, line.dockey, line.seq ?? null, line.styleid ?? null,
              safe(line.number), safe(line.itemcode), safe(line.location), safe(line.batch),
              safe(line.project), safe(line.description), safe(line.description2),
              safe(line.description3), safe(line.permitno),
              safe(line.qty), safe(line.uom), safe(line.rate), safe(line.sqty),
              safe(line.suomqty), safe(line.unitprice), safeDate(line.deliverydate),
              safe(line.disc), safe(line.tax), safe(line.tariff),
              safe(line.taxexemptionreason), safe(line.irbm_classification),
              safe(line.taxrate), safe(line.taxamt), safe(line.localtaxamt),
              safe(line.exempted_taxrate), safe(line.exempted_taxamt),
              line.taxinclusive ?? null, safe(line.amount), safe(line.localamount),
              safe(line.taxableamt), safe(line.amountwithtax), safe(line.account),
              line.printable ?? null, safe(line.fromdoctype),
              line.fromdockey ?? null, line.fromdtlkey ?? null,
              line.transferable ?? null, safe(line.remark1), safe(line.remark2),
              safe(line.companyitemcode),
              line.sdsserialnumber ? JSON.stringify(line.sdsserialnumber) : null,
              safe(line.initialpurchasecost), line.changed ?? null,
            ]);
            lineCount++;
          } catch (e) { /* skip */ }
        }
      }
    } catch (e) {
      skipped++;
      if (skipped <= 3) log(`  ⚠️  INV skip dockey=${r.dockey}: ${e.message.slice(0,80)}`);
    }
  }
  log(`  ✅ ${upserted} invoices upserted, ${lineCount} lines, ${skipped} skipped`);
  await logSync('SALESINVOICES', '/salesinvoice', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 8. RECEIPT VOUCHERS ───────────────────────────────────────
async function migrateReceiptVouchers() {
  log('\n── RECEIPT VOUCHERS (/receiptvoucher) ─────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/receiptvoucher');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_receiptvouchers (
          dockey, docno, doctype, docdate, postdate, taxdate,
          companyname, description, description2,
          paymentmethod, area, agent, project, journal, chequenumber,
          currencycode, currencyrate, bankcharge, bankchargeaccount,
          docamt, localdocamt, fromdoctype, bounceddate, gltransid,
          cancelled, status, depositkey, fromdoc,
          salestaxno, servicetaxno, tin, idtype, idno, tourismno, sic,
          submissiontype, irbm_status, irbm_internalid, irbm_uuid, irbm_longid,
          peppol_uuid, peppol_docuuid, updatecount, printcount,
          attachments, note, approvestate, sql_lastmodified,
          occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,NOW(),$50
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status    = EXCLUDED.status,
          cancelled = EXCLUDED.cancelled,
          docamt    = EXCLUDED.docamt,
          occ_synced_at = NOW()
        WHERE sql_receiptvouchers.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_receiptvouchers.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safe(r.doctype), safeDate(r.docdate),
        safeDate(r.postdate), safeDate(r.taxdate),
        safe(r.companyname), safe(r.description), safe(r.description2),
        safe(r.paymentmethod), safe(r.area), safe(r.agent), safe(r.project),
        safe(r.journal), safe(r.chequenumber), safe(r.currencycode), safe(r.currencyrate),
        safe(r.bankcharge), safe(r.bankchargeaccount), safe(r.docamt), safe(r.localdocamt),
        safe(r.fromdoctype), safeDate(r.bounceddate), r.gltransid ?? null,
        r.cancelled ?? false, r.status ?? null, safe(r.depositkey), safe(r.fromdoc),
        safe(r.salestaxno), safe(r.servicetaxno), safe(r.tin), r.idtype ?? null,
        safe(r.idno), safe(r.tourismno), safe(r.sic), r.submissiontype ?? null,
        r.irbm_status ?? null, safe(r.irbm_internalid), safe(r.irbm_uuid),
        safe(r.irbm_longid), safe(r.peppol_uuid), safe(r.peppol_docuuid),
        r.updatecount ?? null, r.printcount ?? null,
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), r.lastmodified ?? null,
        periodId, JSON.stringify(r),
      ]);
      upserted++;
    } catch (e) {
      skipped++;
      if (skipped <= 3) log(`  ⚠️  RV skip: ${e.message.slice(0,80)}`);
    }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('RECEIPTVOUCHERS', '/receiptvoucher', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 9. PURCHASE ORDERS ────────────────────────────────────────
async function migratePurchaseOrders() {
  log('\n── PURCHASE ORDERS (/purchaseorder) ───────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/purchaseorder');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_purchaseorders (
          dockey, docno, docnoex, docdate, postdate, taxdate,
          code, companyname, address1, address2, address3, address4,
          postcode, city, state, country, phone1, mobile, fax1, attention,
          area, agent, project, terms, currencycode, currencyrate,
          shipper, description, cancelled, status, docamt, localdocamt,
          d_docno, d_paymentmethod, d_chequenumber, d_paymentproject,
          d_bankcharge, d_bankchargeaccount, d_amount,
          validity, deliveryterm, cc, docref1, docref2, docref3, docref4,
          branchname, daddress1, daddress2, daddress3, daddress4,
          dpostcode, dcity, dstate, dcountry, dattention, dphone1, dmobile, dfax1,
          taxexemptno, salestaxno, servicetaxno, tin, idtype, idno,
          tourismno, sic, incoterms, submissiontype, peppol_uuid, businessunit,
          attachments, note, approvestate, transferable, updatecount, printcount,
          sql_lastmodified, occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,
          $67,$68,$69,$70,$71,$72,$73,$74,$75,NOW(),$76
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status    = EXCLUDED.status,
          cancelled = EXCLUDED.cancelled,
          docamt    = EXCLUDED.docamt,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          occ_synced_at = NOW()
        WHERE sql_purchaseorders.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_purchaseorders.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safe(r.docnoex), safeDate(r.docdate),
        safeDate(r.postdate), safeDate(r.taxdate),
        safe(r.code), safe(r.companyname), safe(r.address1), safe(r.address2),
        safe(r.address3), safe(r.address4), safe(r.postcode), safe(r.city),
        safe(r.state), safe(r.country), safe(r.phone1), safe(r.mobile),
        safe(r.fax1), safe(r.attention), safe(r.area), safe(r.agent),
        safe(r.project), safe(r.terms), safe(r.currencycode), safe(r.currencyrate),
        safe(r.shipper), safe(r.description), r.cancelled ?? false, r.status ?? null,
        safe(r.docamt), safe(r.localdocamt), safe(r.d_docno), safe(r.d_paymentmethod),
        safe(r.d_chequenumber), safe(r.d_paymentproject), safe(r.d_bankcharge),
        safe(r.d_bankchargeaccount), safe(r.d_amount), safe(r.validity),
        safe(r.deliveryterm), safe(r.cc),
        safe(r.docref1), safe(r.docref2), safe(r.docref3), safe(r.docref4),
        safe(r.branchname), safe(r.daddress1), safe(r.daddress2), safe(r.daddress3),
        safe(r.daddress4), safe(r.dpostcode), safe(r.dcity), safe(r.dstate),
        safe(r.dcountry), safe(r.dattention), safe(r.dphone1), safe(r.dmobile),
        safe(r.dfax1), safe(r.taxexemptno), safe(r.salestaxno), safe(r.servicetaxno),
        safe(r.tin), r.idtype ?? null, safe(r.idno), safe(r.tourismno),
        safe(r.sic), safe(r.incoterms), r.submissiontype ?? null,
        safe(r.peppol_uuid), safe(r.businessunit),
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), r.transferable ?? null,
        r.updatecount ?? null, r.printcount ?? null, r.lastmodified ?? null,
        periodId, JSON.stringify(r),
      ]);
      upserted++;
    } catch (e) {
      skipped++;
      if (skipped <= 3) log(`  ⚠️  PO skip: ${e.message.slice(0,80)}`);
    }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('PURCHASEORDERS', '/purchaseorder', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 10. PURCHASE INVOICES ─────────────────────────────────────
async function migratePurchaseInvoices() {
  log('\n── PURCHASE INVOICES (/purchaseinvoice) ───────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/purchaseinvoice');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_purchaseinvoices (
          dockey, docno, docnoex, docdate, postdate, taxdate,
          code, companyname, address1, address2, address3, address4,
          postcode, city, state, country, phone1, mobile, fax1, attention,
          area, agent, project, terms, currencycode, currencyrate,
          shipper, description, cancelled, status,
          docamt, localdocamt, landingcost1, landingcost2, localtotalwithcost, d_amount,
          validity, deliveryterm, cc, docref1, docref2, docref3, docref4,
          branchname, daddress1, daddress2, daddress3, daddress4,
          dpostcode, dcity, dstate, dcountry, dattention, dphone1, dmobile, dfax1,
          taxexemptno, salestaxno, servicetaxno, tin, idtype, idno,
          tourismno, sic, incoterms, submissiontype,
          irbm_status, irbm_internalid, irbm_uuid, irbm_longid,
          peppol_uuid, peppol_docuuid, businessunit,
          attachments, note, approvestate, transferable, updatecount, printcount,
          sql_lastmodified, occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,$42,$43,$44,$45,$46,$47,$48,$49,$50,
          $51,$52,$53,$54,$55,$56,$57,$58,$59,$60,$61,$62,$63,$64,$65,$66,
          $67,$68,$69,$70,$71,$72,$73,$74,$75,$76,$77,$78,$79,$80,NOW(),$81
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status    = EXCLUDED.status,
          cancelled = EXCLUDED.cancelled,
          docamt    = EXCLUDED.docamt,
          sql_lastmodified = EXCLUDED.sql_lastmodified,
          occ_synced_at = NOW()
        WHERE sql_purchaseinvoices.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_purchaseinvoices.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safe(r.docnoex), safeDate(r.docdate),
        safeDate(r.postdate), safeDate(r.taxdate),
        safe(r.code), safe(r.companyname), safe(r.address1), safe(r.address2),
        safe(r.address3), safe(r.address4), safe(r.postcode), safe(r.city),
        safe(r.state), safe(r.country), safe(r.phone1), safe(r.mobile),
        safe(r.fax1), safe(r.attention), safe(r.area), safe(r.agent),
        safe(r.project), safe(r.terms), safe(r.currencycode), safe(r.currencyrate),
        safe(r.shipper), safe(r.description), r.cancelled ?? false, r.status ?? null,
        safe(r.docamt), safe(r.localdocamt), safe(r.landingcost1), safe(r.landingcost2),
        safe(r.localtotalwithcost), safe(r.d_amount), safe(r.validity),
        safe(r.deliveryterm), safe(r.cc),
        safe(r.docref1), safe(r.docref2), safe(r.docref3), safe(r.docref4),
        safe(r.branchname), safe(r.daddress1), safe(r.daddress2), safe(r.daddress3),
        safe(r.daddress4), safe(r.dpostcode), safe(r.dcity), safe(r.dstate),
        safe(r.dcountry), safe(r.dattention), safe(r.dphone1), safe(r.dmobile),
        safe(r.dfax1), safe(r.taxexemptno), safe(r.salestaxno), safe(r.servicetaxno),
        safe(r.tin), r.idtype ?? null, safe(r.idno), safe(r.tourismno),
        safe(r.sic), safe(r.incoterms), r.submissiontype ?? null,
        r.irbm_status ?? null, safe(r.irbm_internalid), safe(r.irbm_uuid),
        safe(r.irbm_longid), safe(r.peppol_uuid), safe(r.peppol_docuuid),
        safe(r.businessunit), r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), r.transferable ?? null,
        r.updatecount ?? null, r.printcount ?? null, r.lastmodified ?? null,
        periodId, JSON.stringify(r),
      ]);
      upserted++;
    } catch (e) {
      skipped++;
      if (skipped <= 3) log(`  ⚠️  PI skip: ${e.message.slice(0,80)}`);
    }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('PURCHASEINVOICES', '/purchaseinvoice', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 11. SUPPLIER PAYMENTS ─────────────────────────────────────
async function migrateSupplierPayments() {
  log('\n── SUPPLIER PAYMENTS (/supplierpayment) ───────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/supplierpayment');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_supplierpayments (
          dockey, docno, code, docdate, postdate, taxdate, description,
          area, agent, paymentmethod, chequenumber, journal, project,
          paymentproject, currencycode, currencyrate, bankacc, bankcharge,
          bankchargeaccount, docamt, localdocamt, unappliedamt,
          docref1, docref2, fromdoctype, fromdockey, gltransid,
          cancelled, status, nonrefundable, bounceddate, updatecount,
          attachments, note, approvestate, sql_lastmodified,
          banktransfertype, bankrefno, bankstatus, bankstatusdesc,
          occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,
          $19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,
          $35,$36,$37,$38,$39,$40,$41,NOW(),$42
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status    = EXCLUDED.status,
          cancelled = EXCLUDED.cancelled,
          docamt    = EXCLUDED.docamt,
          occ_synced_at = NOW()
        WHERE sql_supplierpayments.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_supplierpayments.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safe(r.code), safeDate(r.docdate),
        safeDate(r.postdate), safeDate(r.taxdate), safe(r.description),
        safe(r.area), safe(r.agent), safe(r.paymentmethod), safe(r.chequenumber),
        safe(r.journal), safe(r.project), safe(r.paymentproject),
        safe(r.currencycode), safe(r.currencyrate), safe(r.bankacc),
        safe(r.bankcharge), safe(r.bankchargeaccount), safe(r.docamt),
        safe(r.localdocamt), safe(r.unappliedamt), safe(r.docref1), safe(r.docref2),
        safe(r.fromdoctype), r.fromdockey ?? null, r.gltransid ?? null,
        r.cancelled ?? false, r.status ?? null, r.nonrefundable ?? null,
        safeDate(r.bounceddate), r.updatecount ?? null,
        r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), r.lastmodified ?? null,
        r.banktransfertype ?? null, safe(r.bankrefno), safe(r.bankstatus),
        safe(r.bankstatusdesc), periodId, JSON.stringify(r),
      ]);
      upserted++;
    } catch (e) {
      skipped++;
      if (skipped <= 3) log(`  ⚠️  SP skip: ${e.message.slice(0,80)}`);
    }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('SUPPLIERPAYMENTS', '/supplierpayment', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// ── 12. JOURNAL ENTRIES ───────────────────────────────────────
async function migrateJournalEntries() {
  log('\n── JOURNAL ENTRIES (/journalentry) ────────────────────');
  const started = new Date();
  const { blocked, records } = await fetchAllPages('/journalentry');
  if (blocked) return;

  let upserted = 0, skipped = 0;
  for (const r of records) {
    try {
      const periodId = await getPeriodId(r.docdate);
      await query(`
        INSERT INTO sql_journalentries (
          dockey, docno, docdate, postdate, taxdate, journal, description,
          currencycode, currencyrate, gltransid, cancelled, status,
          updatecount, printcount, attachments, note, approvestate,
          fromdoctype, fromdockey, sql_lastmodified, occ_period_id, occ_synced_at, sql_raw
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,NOW(),$22
        )
        ON CONFLICT (dockey) DO UPDATE SET
          status    = EXCLUDED.status,
          cancelled = EXCLUDED.cancelled,
          occ_synced_at = NOW()
        WHERE sql_journalentries.sql_lastmodified IS NULL
           OR EXCLUDED.sql_lastmodified > sql_journalentries.sql_lastmodified
      `, [
        r.dockey, safe(r.docno), safeDate(r.docdate), safeDate(r.postdate),
        safeDate(r.taxdate), safe(r.journal), safe(r.description),
        safe(r.currencycode), safe(r.currencyrate), r.gltransid ?? null,
        r.cancelled ?? false, r.status ?? null, r.updatecount ?? null,
        r.printcount ?? null, r.attachments ? JSON.stringify(r.attachments) : null,
        safe(r.note), safe(r.approvestate), safe(r.fromdoctype),
        r.fromdockey ?? null, r.lastmodified ?? null, periodId, JSON.stringify(r),
      ]);
      upserted++;
    } catch (e) { skipped++; }
  }
  log(`  ✅ ${upserted} upserted, ${skipped} skipped`);
  await logSync('JOURNALENTRIES', '/journalentry', 'SUCCESS', records.length, upserted, skipped, null, started);
}

// =============================================================
// MAIN — run all migrations in dependency order
// =============================================================
async function main() {
  const totalStart = Date.now();
  log('=============================================================');
  log('OCC — SQL Account → PostgreSQL Full Migration');
  log(`Started: ${new Date().toISOString()}`);
  log('=============================================================');

  // Test DB connection first
  try {
    await query('SELECT NOW()');
    log('✅ Database connection OK\n');
  } catch (e) {
    log(`❌ Database connection failed: ${e.message}`);
    process.exit(1);
  }

  // Run in order — master data first, then transactional
  await migrateCustomers();
  await migrateSuppliers();
  await migrateStockItems();
  await migrateAccounts();
  await migrateSalesOrders();       // includes SO lines (detail fetch per SO)
  await migrateDeliveryOrders();    // includes DO lines
  await migrateSalesInvoices();     // includes invoice lines
  await migrateReceiptVouchers();
  await migratePurchaseOrders();
  await migratePurchaseInvoices();
  await migrateSupplierPayments();
  await migrateJournalEntries();

  // Final count
  log('\n=============================================================');
  log('FINAL RECORD COUNTS');
  log('=============================================================');
  const tables = [
    'sql_customers','sql_suppliers','sql_stockitems','sql_accounts',
    'sql_salesorders','sql_so_lines',
    'sql_deliveryorders','sql_do_lines',
    'sql_salesinvoices','sql_inv_lines',
    'sql_receiptvouchers','sql_purchaseorders',
    'sql_purchaseinvoices','sql_supplierpayments','sql_journalentries',
  ];
  for (const t of tables) {
    const r = await query(`SELECT COUNT(*) FROM ${t}`);
    log(`  ${t.padEnd(25)} ${r.rows[0].count} rows`);
  }

  const mins = ((Date.now() - totalStart) / 60000).toFixed(1);
  log(`\n✅ Migration complete in ${mins} minutes`);
  log('=============================================================');
  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
