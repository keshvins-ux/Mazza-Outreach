-- ============================================================
-- OCC ERP — Postgres Schema v2
-- Built from LIVE SQL Account API audit — 2026-04-07
-- Every table mirrors SQL Account field names EXACTLY
-- No assumptions. No invented field names.
-- MYR only | Weighted Average Cost | Jan-Dec | No SST
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- SYSTEM: PERIODS
-- ============================================================
CREATE TABLE occ_periods (
  id              SERIAL PRIMARY KEY,
  period_code     VARCHAR(7)  NOT NULL UNIQUE,   -- '2026-01'
  period_name     VARCHAR(30) NOT NULL,           -- 'January 2026'
  year            SMALLINT    NOT NULL,
  month           SMALLINT    NOT NULL CHECK (month BETWEEN 1 AND 12),
  start_date      DATE        NOT NULL,
  end_date        DATE        NOT NULL,
  status          VARCHAR(10) NOT NULL DEFAULT 'OPEN'
                    CHECK (status IN ('OPEN','CLOSED','LOCKED')),
  closed_by       INTEGER,
  closed_at       TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT period_month_unique UNIQUE (year, month)
);

INSERT INTO occ_periods (period_code, period_name, year, month, start_date, end_date, status)
SELECT
  TO_CHAR(d, 'YYYY-MM'),
  TRIM(TO_CHAR(d, 'Month')) || ' ' || TO_CHAR(d, 'YYYY'),
  EXTRACT(YEAR  FROM d)::SMALLINT,
  EXTRACT(MONTH FROM d)::SMALLINT,
  DATE_TRUNC('month', d)::DATE,
  (DATE_TRUNC('month', d) + INTERVAL '1 month - 1 day')::DATE,
  CASE WHEN DATE_TRUNC('month', d) < DATE_TRUNC('month', NOW())
       THEN 'CLOSED' ELSE 'OPEN' END
FROM GENERATE_SERIES('2024-01-01'::DATE, '2027-12-01'::DATE, '1 month') AS d;

-- ============================================================
-- SYSTEM: USERS (OCC team — mirrors Redis auth)
-- ============================================================
CREATE TABLE occ_users (
  id              SERIAL PRIMARY KEY,
  username        VARCHAR(50)  NOT NULL UNIQUE,
  full_name       VARCHAR(100) NOT NULL,
  role            VARCHAR(20)  NOT NULL
                    CHECK (role IN ('admin','sales','ops','procurement','production','finance','viewer')),
  is_active       BOOLEAN DEFAULT TRUE,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO occ_users (username, full_name, role) VALUES
('keshvin',  'Keshvin',  'admin'),
('jasmine',  'Jasmine',  'sales'),
('varinder', 'Varinder', 'admin'),
('narin',    'Narin',    'sales'),
('vitya',    'Vitya',    'ops'),
('navin',    'Navin',    'procurement'),
('yuges',    'Yuges',    'production'),
('mhae',     'Mhae',     'sales'),
('amirun',   'Amirun',   'ops');

-- ============================================================
-- MASTER: CHART OF ACCOUNTS
-- Source: /account endpoint (confirmed accessible)
-- SQL Account fields: dockey, parent, code, description,
--   description2, acctype, specialacctype, tax, cashflowtype, sic
-- ============================================================
CREATE TABLE sql_accounts (
  -- SQL Account native fields (exact names)
  dockey          INTEGER      NOT NULL UNIQUE,   -- SQL Account primary key
  parent          INTEGER,                         -- parent account dockey
  code            VARCHAR(20)  NOT NULL UNIQUE,   -- e.g. '100-0000', '500-1000'
  description     VARCHAR(200) NOT NULL,
  description2    VARCHAR(200),
  acctype         VARCHAR(10),                     -- 'CP','CA','CL','RE','EX' etc
  specialacctype  VARCHAR(10),
  tax             VARCHAR(20),
  cashflowtype    SMALLINT,
  sic             VARCHAR(20),
  -- OCC enrichment (not from SQL)
  occ_category    VARCHAR(20),                     -- 'ASSET','LIABILITY','EQUITY','REVENUE','COGS','EXPENSE'
  occ_normal_bal  VARCHAR(6),                      -- 'DEBIT' or 'CREDIT'
  -- Sync metadata
  sql_lastmodified BIGINT,                         -- Unix timestamp from SQL Account
  synced_at       TIMESTAMPTZ DEFAULT NOW(),
  is_active       BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_sql_accounts_code   ON sql_accounts(code);
CREATE INDEX idx_sql_accounts_parent ON sql_accounts(parent);

-- ============================================================
-- MASTER: CUSTOMERS
-- Source: /customer endpoint
-- SQL Account fields confirmed from audit (43 fields)
-- ============================================================
CREATE TABLE sql_customers (
  -- SQL Account native fields (exact names, exact order from audit)
  code                VARCHAR(20)  NOT NULL UNIQUE, -- '300-A001'
  controlaccount      VARCHAR(20),                   -- '300-0000'
  companyname         VARCHAR(200) NOT NULL,
  companyname2        VARCHAR(200),
  companycategory     VARCHAR(100),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  biznature           VARCHAR(100),
  creditterm          VARCHAR(50),                   -- '30 Days', 'C.O.D.'
  creditlimit         VARCHAR(20),                   -- stored as string in SQL Account
  overduelimit        VARCHAR(20),
  statementtype       VARCHAR(5),                    -- 'O' = open item
  currencycode        VARCHAR(10),
  outstanding         VARCHAR(20),
  allowexceedcreditlimit BOOLEAN,
  addpdctocrlimit     BOOLEAN,
  agingon             VARCHAR(5),                    -- 'I' = invoice date
  status              VARCHAR(5),                    -- 'A' = active
  pricetag            VARCHAR(50),
  creationdate        DATE,
  tax                 VARCHAR(20),
  taxexemptno         VARCHAR(50),
  taxexpdate          DATE,
  brn                 VARCHAR(50),                   -- Business Registration Number
  brn2                VARCHAR(50),
  gstno               VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  submissiontype      SMALLINT,
  irbm_classification VARCHAR(20),
  inforequest_uuid    VARCHAR(100),
  peppolid            VARCHAR(100),
  businessunit        VARCHAR(100),
  taxarea             VARCHAR(50),
  attachments         JSONB,
  remark              TEXT,
  note                TEXT,
  sql_lastmodified    BIGINT,                        -- Unix timestamp — use for incremental sync
  -- Sync metadata
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sql_customers_code ON sql_customers(code);
CREATE INDEX idx_sql_customers_name ON sql_customers(companyname);
CREATE INDEX idx_sql_customers_lastmod ON sql_customers(sql_lastmodified);

-- ============================================================
-- MASTER: SUPPLIERS
-- Source: /supplier endpoint
-- Identical field structure to /customer (confirmed from audit)
-- ============================================================
CREATE TABLE sql_suppliers (
  code                VARCHAR(20)  NOT NULL UNIQUE, -- '400-A0003'
  controlaccount      VARCHAR(20),
  companyname         VARCHAR(200) NOT NULL,
  companyname2        VARCHAR(200),
  companycategory     VARCHAR(100),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  biznature           VARCHAR(100),
  creditterm          VARCHAR(50),
  creditlimit         VARCHAR(20),
  overduelimit        VARCHAR(20),
  statementtype       VARCHAR(5),
  currencycode        VARCHAR(10),
  outstanding         VARCHAR(20),
  allowexceedcreditlimit BOOLEAN,
  addpdctocrlimit     BOOLEAN,
  agingon             VARCHAR(5),
  status              VARCHAR(5),
  pricetag            VARCHAR(50),
  creationdate        DATE,
  tax                 VARCHAR(50),
  taxexemptno         VARCHAR(50),
  taxexpdate          DATE,
  brn                 VARCHAR(50),
  brn2                VARCHAR(50),
  gstno               VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  submissiontype      SMALLINT,
  irbm_classification VARCHAR(20),
  inforequest_uuid    VARCHAR(100),
  peppolid            VARCHAR(100),
  businessunit        VARCHAR(100),
  taxarea             VARCHAR(50),
  attachments         JSONB,
  remark              TEXT,
  note                TEXT,
  sql_lastmodified    BIGINT,
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sql_suppliers_code ON sql_suppliers(code);
CREATE INDEX idx_sql_suppliers_name ON sql_suppliers(companyname);

-- ============================================================
-- MASTER: STOCK ITEMS
-- Source: /stockitem endpoint (39 fields confirmed)
-- ============================================================
CREATE TABLE sql_stockitems (
  -- SQL Account native fields
  dockey              INTEGER      NOT NULL UNIQUE,
  code                VARCHAR(50)  NOT NULL UNIQUE, -- 'AFP-001', 'CP-002'
  description         VARCHAR(200) NOT NULL,
  description2        VARCHAR(200),
  description3        VARCHAR(200),
  stockgroup          VARCHAR(100),                  -- 'FINISHED GOODS - SPI', 'RAW MATERIAL'
  stockcontrol        BOOLEAN,
  costingmethod       SMALLINT,                      -- 1 = weighted average
  serialnumber        BOOLEAN,
  remark1             VARCHAR(200),
  remark2             VARCHAR(200),
  minqty              VARCHAR(20),
  maxqty              VARCHAR(20),
  reorderlevel        VARCHAR(20),
  reorderqty          VARCHAR(20),
  shelf               VARCHAR(50),
  suom                VARCHAR(20),                   -- secondary UOM
  itemtype            VARCHAR(10),                   -- '-' = normal stock item
  leadtime            SMALLINT,
  bom_leadtime        SMALLINT,
  bom_asmcost         VARCHAR(20),
  sltax               VARCHAR(20),
  phtax               VARCHAR(20),
  tariff              VARCHAR(50),
  irbm_classification VARCHAR(20),
  stockmatrix         VARCHAR(50),
  defuom_st           VARCHAR(20),                   -- default UOM for stock
  defuom_sl           VARCHAR(20),                   -- default UOM for sales
  defuom_ph           VARCHAR(20),                   -- default UOM for purchase
  scriptcode          VARCHAR(50),
  isactive            BOOLEAN,
  balsqty             VARCHAR(20),                   -- balance qty on item record (may be stale)
  balsuomqty          VARCHAR(20),
  creationdate        DATE,
  picture             TEXT,
  pictureclass        VARCHAR(50),
  attachments         JSONB,
  note                TEXT,
  sql_lastmodified    BIGINT,
  -- OCC enrichment
  occ_item_category   VARCHAR(30),                   -- 'FINISHED','RAW_MATERIAL','PACKAGING','TRADING'
  occ_uom             VARCHAR(20),                   -- primary UOM confirmed from documents
  occ_weighted_avg_cost NUMERIC(18,6) DEFAULT 0,     -- maintained by OCC from GRN
  -- Sync metadata
  synced_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sql_stockitems_code  ON sql_stockitems(code);
CREATE INDEX idx_sql_stockitems_group ON sql_stockitems(stockgroup);

-- ============================================================
-- SALES ORDERS
-- Source: /salesorder and /salesorder/{dockey}
-- Header: 78 fields (list) + 4 extra (detail)
-- Lines: sdsdocdetail[] — 47 fields confirmed
-- ============================================================
CREATE TABLE sql_salesorders (
  -- Primary key
  dockey              INTEGER      NOT NULL UNIQUE,
  -- Core document fields (exact SQL Account names)
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'SO-00320'
  docnoex             VARCHAR(30),
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  -- Customer (denormalized from SQL Account — stored as-is)
  code                VARCHAR(20),                   -- customer code '300-A001'
  companyname         VARCHAR(200),
  address1            VARCHAR(200),
  address2            VARCHAR(200),
  address3            VARCHAR(200),
  address4            VARCHAR(200),
  postcode            VARCHAR(20),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(10),
  phone1              VARCHAR(50),
  mobile              VARCHAR(50),
  fax1                VARCHAR(50),
  attention           VARCHAR(100),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  project             VARCHAR(50),
  terms               VARCHAR(50),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  shipper             VARCHAR(50),
  description         VARCHAR(200),
  -- Status
  cancelled           BOOLEAN DEFAULT FALSE,
  status              SMALLINT,                      -- 0=Active, 1=Closed, 2=Cancelled
  -- Amounts
  docamt              VARCHAR(30),                   -- stored as string (SQL returns numeric_string)
  localdocamt         VARCHAR(30),
  d_docno             VARCHAR(30),
  d_paymentmethod     VARCHAR(50),
  d_chequenumber      VARCHAR(50),
  d_paymentproject    VARCHAR(50),
  d_bankcharge        VARCHAR(20),
  d_bankchargeaccount VARCHAR(50),
  d_amount            VARCHAR(20),
  -- Dates / terms
  validity            VARCHAR(50),
  deliveryterm        VARCHAR(100),
  cc                  VARCHAR(50),
  -- Reference fields (CRITICAL — team uses these)
  docref1             VARCHAR(200),                  -- customer PO number
  docref2             VARCHAR(200),                  -- OCC delivery date / progress
  docref3             VARCHAR(200),                  -- 'DONE' when fulfilled
  docref4             VARCHAR(200),                  -- available
  -- Delivery address
  branchname          VARCHAR(200),
  daddress1           VARCHAR(200),
  daddress2           VARCHAR(200),
  daddress3           VARCHAR(200),
  daddress4           VARCHAR(200),
  dpostcode           VARCHAR(20),
  dcity               VARCHAR(100),
  dstate              VARCHAR(100),
  dcountry            VARCHAR(10),
  dattention          VARCHAR(100),
  dphone1             VARCHAR(50),
  dmobile             VARCHAR(50),
  dfax1               VARCHAR(50),
  -- Tax / compliance
  taxexemptno         VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  incoterms           VARCHAR(50),
  submissiontype      SMALLINT,
  peppol_uuid         VARCHAR(100),
  businessunit        VARCHAR(100),
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  transferable        BOOLEAN,
  updatecount         INTEGER,
  printcount          INTEGER,
  sql_lastmodified    BIGINT,
  -- Detail-only fields (only present in /salesorder/{dockey})
  changed             BOOLEAN,
  docnosetkey         INTEGER,
  nextdocno           VARCHAR(30),
  im_scan_autokey     VARCHAR(50),
  -- OCC metadata
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  occ_updated_at      TIMESTAMPTZ DEFAULT NOW(),
  -- Raw SQL Account response stored for audit/reconciliation
  sql_raw             JSONB
);

CREATE INDEX idx_so_dockey   ON sql_salesorders(dockey);
CREATE INDEX idx_so_docno    ON sql_salesorders(docno);
CREATE INDEX idx_so_code     ON sql_salesorders(code);
CREATE INDEX idx_so_status   ON sql_salesorders(status);
CREATE INDEX idx_so_docdate  ON sql_salesorders(docdate);
CREATE INDEX idx_so_lastmod  ON sql_salesorders(sql_lastmodified);

-- SO Line Items (sdsdocdetail[])
-- Confirmed fields from /salesorder/{dockey} audit
CREATE TABLE sql_so_lines (
  id                  BIGSERIAL    PRIMARY KEY,
  -- SQL Account native fields (exact names)
  dtlkey              INTEGER      NOT NULL,         -- SQL Account line primary key
  dockey              INTEGER      NOT NULL REFERENCES sql_salesorders(dockey) ON DELETE CASCADE,
  seq                 INTEGER,                       -- display order (1000, 2000, ...)
  styleid             INTEGER,
  number              VARCHAR(20),                   -- line number display
  itemcode            VARCHAR(50),
  location            VARCHAR(50),
  batch               VARCHAR(50),
  project             VARCHAR(50),
  description         VARCHAR(200),
  description2        VARCHAR(200),
  description3        VARCHAR(200),
  permitno            VARCHAR(50),
  qty                 VARCHAR(30),                   -- stored as string
  uom                 VARCHAR(20),
  rate                VARCHAR(20),
  sqty                VARCHAR(30),                   -- secondary UOM qty
  suomqty             VARCHAR(30),
  offsetqty           VARCHAR(30),                   -- CRITICAL: qty already fulfilled by DOs
  unitprice           VARCHAR(30),
  deliverydate        DATE,
  disc                VARCHAR(50),                   -- discount
  tax                 VARCHAR(20),
  tariff              VARCHAR(50),
  taxexemptionreason  VARCHAR(100),
  irbm_classification VARCHAR(20),
  taxrate             VARCHAR(20),
  taxamt              VARCHAR(30),
  localtaxamt         VARCHAR(30),
  exempted_taxrate    VARCHAR(20),
  exempted_taxamt     VARCHAR(30),
  taxinclusive        BOOLEAN,
  amount              VARCHAR(30),
  localamount         VARCHAR(30),
  amountwithtax       VARCHAR(30),
  printable           BOOLEAN,
  fromdoctype         VARCHAR(10),                   -- null for SO lines
  fromdockey          INTEGER,
  fromdtlkey          INTEGER,
  transferable        BOOLEAN,
  remark1             VARCHAR(200),
  remark2             VARCHAR(200),
  companyitemcode     VARCHAR(50),
  initialpurchasecost VARCHAR(30),
  changed             BOOLEAN,
  -- OCC computed (derived from qty and offsetqty for fast queries)
  occ_qty             NUMERIC(18,4) GENERATED ALWAYS AS
                        (CASE WHEN qty ~ '^\d+(\.\d+)?$' THEN qty::NUMERIC ELSE 0 END) STORED,
  occ_offsetqty       NUMERIC(18,4) GENERATED ALWAYS AS
                        (CASE WHEN offsetqty ~ '^\d+(\.\d+)?$' THEN offsetqty::NUMERIC ELSE 0 END) STORED,
  occ_balance         NUMERIC(18,4) GENERATED ALWAYS AS
                        (CASE WHEN qty ~ '^\d+(\.\d+)?$' AND offsetqty ~ '^\d+(\.\d+)?$'
                         THEN GREATEST(0, qty::NUMERIC - offsetqty::NUMERIC)
                         ELSE CASE WHEN qty ~ '^\d+(\.\d+)?$' THEN qty::NUMERIC ELSE 0 END
                         END) STORED,
  CONSTRAINT so_line_dtlkey_unique UNIQUE (dtlkey)
);

CREATE INDEX idx_so_lines_dockey  ON sql_so_lines(dockey);
CREATE INDEX idx_so_lines_itemcode ON sql_so_lines(itemcode);
CREATE INDEX idx_so_lines_dtlkey  ON sql_so_lines(dtlkey);

-- ============================================================
-- DELIVERY ORDERS
-- Source: /deliveryorder and /deliveryorder/{dockey}
-- Key difference from SO: lines have receiveqty + returnqty, NO offsetqty
-- ============================================================
CREATE TABLE sql_deliveryorders (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'DO-00001'
  docnoex             VARCHAR(30),
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  code                VARCHAR(20),
  companyname         VARCHAR(200),
  address1            VARCHAR(200),
  address2            VARCHAR(200),
  address3            VARCHAR(200),
  address4            VARCHAR(200),
  postcode            VARCHAR(20),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(10),
  phone1              VARCHAR(50),
  mobile              VARCHAR(50),
  fax1                VARCHAR(50),
  attention           VARCHAR(100),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  project             VARCHAR(50),
  terms               VARCHAR(50),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  shipper             VARCHAR(50),
  description         VARCHAR(200),
  cancelled           BOOLEAN DEFAULT FALSE,
  status              SMALLINT,
  docamt              VARCHAR(30),
  localdocamt         VARCHAR(30),
  d_amount            VARCHAR(20),
  validity            VARCHAR(50),
  deliveryterm        VARCHAR(100),
  cc                  VARCHAR(50),
  docref1             VARCHAR(200),
  docref2             VARCHAR(200),
  docref3             VARCHAR(200),
  docref4             VARCHAR(200),
  branchname          VARCHAR(200),
  daddress1           VARCHAR(200),
  daddress2           VARCHAR(200),
  daddress3           VARCHAR(200),
  daddress4           VARCHAR(200),
  dpostcode           VARCHAR(20),
  dcity               VARCHAR(100),
  dstate              VARCHAR(100),
  dcountry            VARCHAR(10),
  dattention          VARCHAR(100),
  dphone1             VARCHAR(50),
  dmobile             VARCHAR(50),
  dfax1               VARCHAR(50),
  taxexemptno         VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  incoterms           VARCHAR(50),
  submissiontype      SMALLINT,
  businessunit        VARCHAR(100),
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  transferable        BOOLEAN,
  updatecount         INTEGER,
  printcount          INTEGER,
  sql_lastmodified    BIGINT,
  changed             BOOLEAN,
  docnosetkey         INTEGER,
  nextdocno           VARCHAR(30),
  im_scan_autokey     VARCHAR(50),
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  occ_updated_at      TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

CREATE INDEX idx_do_dockey  ON sql_deliveryorders(dockey);
CREATE INDEX idx_do_docno   ON sql_deliveryorders(docno);
CREATE INDEX idx_do_code    ON sql_deliveryorders(code);
CREATE INDEX idx_do_lastmod ON sql_deliveryorders(sql_lastmodified);

-- DO Line Items
-- Key difference: receiveqty + returnqty fields, NO offsetqty
CREATE TABLE sql_do_lines (
  id                  BIGSERIAL    PRIMARY KEY,
  dtlkey              INTEGER      NOT NULL,
  dockey              INTEGER      NOT NULL REFERENCES sql_deliveryorders(dockey) ON DELETE CASCADE,
  seq                 INTEGER,
  styleid             INTEGER,
  number              VARCHAR(20),
  itemcode            VARCHAR(50),
  location            VARCHAR(50),
  batch               VARCHAR(50),
  project             VARCHAR(50),
  description         VARCHAR(200),
  description2        VARCHAR(200),
  description3        VARCHAR(200),
  permitno            VARCHAR(50),
  receiveqty          VARCHAR(30),                   -- DO-specific: qty physically received
  returnqty           VARCHAR(30),                   -- DO-specific: qty returned
  qty                 VARCHAR(30),                   -- net qty (receiveqty - returnqty)
  uom                 VARCHAR(20),
  rate                VARCHAR(20),
  sqty                VARCHAR(30),
  suomqty             VARCHAR(30),
  unitprice           VARCHAR(30),
  disc                VARCHAR(50),
  tax                 VARCHAR(20),
  tariff              VARCHAR(50),
  taxexemptionreason  VARCHAR(100),
  irbm_classification VARCHAR(20),
  taxrate             VARCHAR(20),
  taxamt              VARCHAR(30),
  localtaxamt         VARCHAR(30),
  exempted_taxrate    VARCHAR(20),
  exempted_taxamt     VARCHAR(30),
  taxinclusive        BOOLEAN,
  amount              VARCHAR(30),
  localamount         VARCHAR(30),
  amountwithtax       VARCHAR(30),
  printable           BOOLEAN,
  fromdoctype         VARCHAR(10),                   -- source doc type
  fromdockey          INTEGER,                       -- source SO dockey
  fromdtlkey          INTEGER,                       -- source SO line dtlkey — CRITICAL
  transferable        BOOLEAN,
  remark1             VARCHAR(200),
  remark2             VARCHAR(200),
  companyitemcode     VARCHAR(50),
  sdsserialnumber     JSONB,                         -- array
  initialpurchasecost VARCHAR(30),
  changed             BOOLEAN,
  -- OCC computed
  occ_qty             NUMERIC(18,4) GENERATED ALWAYS AS
                        (CASE WHEN qty ~ '^\d+(\.\d+)?$' THEN qty::NUMERIC ELSE 0 END) STORED,
  CONSTRAINT do_line_dtlkey_unique UNIQUE (dtlkey)
);

CREATE INDEX idx_do_lines_dockey    ON sql_do_lines(dockey);
CREATE INDEX idx_do_lines_itemcode  ON sql_do_lines(itemcode);
CREATE INDEX idx_do_lines_fromdockey ON sql_do_lines(fromdockey);
CREATE INDEX idx_do_lines_fromdtlkey ON sql_do_lines(fromdtlkey);

-- ============================================================
-- SALES INVOICES
-- Source: /salesinvoice and /salesinvoice/{dockey}
-- Key: docno is plain integer string ("31543"), not prefixed
-- Lines have extra: account (GL code), taxableamt, sdsserialnumber[]
-- ============================================================
CREATE TABLE sql_salesinvoices (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- plain integer e.g. "31543"
  docnoex             VARCHAR(30),
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  eiv_utc             TIMESTAMPTZ,
  eiv_received_utc    TIMESTAMPTZ,
  eiv_validated_utc   TIMESTAMPTZ,
  code                VARCHAR(20),
  companyname         VARCHAR(200),
  address1            VARCHAR(200),
  address2            VARCHAR(200),
  address3            VARCHAR(200),
  address4            VARCHAR(200),
  postcode            VARCHAR(20),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(10),
  phone1              VARCHAR(50),
  mobile              VARCHAR(50),
  fax1                VARCHAR(50),
  attention           VARCHAR(100),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  project             VARCHAR(50),
  terms               VARCHAR(50),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  shipper             VARCHAR(50),
  description         VARCHAR(200),
  cancelled           BOOLEAN DEFAULT FALSE,
  status              SMALLINT,
  docamt              VARCHAR(30),
  localdocamt         VARCHAR(30),
  d_amount            VARCHAR(20),
  validity            VARCHAR(50),
  deliveryterm        VARCHAR(100),
  cc                  VARCHAR(50),
  docref1             VARCHAR(200),
  docref2             VARCHAR(200),
  docref3             VARCHAR(200),
  docref4             VARCHAR(200),
  branchname          VARCHAR(200),
  daddress1           VARCHAR(200),
  daddress2           VARCHAR(200),
  daddress3           VARCHAR(200),
  daddress4           VARCHAR(200),
  dpostcode           VARCHAR(20),
  dcity               VARCHAR(100),
  dstate              VARCHAR(100),
  dcountry            VARCHAR(10),
  dattention          VARCHAR(100),
  dphone1             VARCHAR(50),
  dmobile             VARCHAR(50),
  dfax1               VARCHAR(50),
  taxexemptno         VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  incoterms           VARCHAR(50),
  submissiontype      SMALLINT,
  irbm_status         SMALLINT,
  irbm_internalid     VARCHAR(100),
  irbm_uuid           VARCHAR(100),
  irbm_longid         VARCHAR(200),
  eivrequest_uuid     VARCHAR(100),
  peppol_uuid         VARCHAR(100),
  peppol_docuuid      VARCHAR(100),
  businessunit        VARCHAR(100),
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  transferable        BOOLEAN,
  updatecount         INTEGER,
  printcount          INTEGER,
  sql_lastmodified    BIGINT,
  changed             BOOLEAN,
  docnosetkey         INTEGER,
  nextdocno           VARCHAR(30),
  im_scan_autokey     VARCHAR(50),
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  occ_updated_at      TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

CREATE INDEX idx_inv_dockey  ON sql_salesinvoices(dockey);
CREATE INDEX idx_inv_docno   ON sql_salesinvoices(docno);
CREATE INDEX idx_inv_code    ON sql_salesinvoices(code);
CREATE INDEX idx_inv_lastmod ON sql_salesinvoices(sql_lastmodified);

-- Invoice Line Items
-- Extra fields vs SO/DO lines: account (GL code), taxableamt, sdsserialnumber[]
CREATE TABLE sql_inv_lines (
  id                  BIGSERIAL    PRIMARY KEY,
  dtlkey              INTEGER      NOT NULL,
  dockey              INTEGER      NOT NULL REFERENCES sql_salesinvoices(dockey) ON DELETE CASCADE,
  seq                 INTEGER,
  styleid             INTEGER,
  number              VARCHAR(20),
  itemcode            VARCHAR(50),
  location            VARCHAR(50),
  batch               VARCHAR(50),
  project             VARCHAR(50),
  description         VARCHAR(200),
  description2        VARCHAR(200),
  description3        VARCHAR(200),
  permitno            VARCHAR(50),
  qty                 VARCHAR(30),
  uom                 VARCHAR(20),
  rate                VARCHAR(20),
  sqty                VARCHAR(30),
  suomqty             VARCHAR(30),
  unitprice           VARCHAR(30),
  deliverydate        DATE,
  disc                VARCHAR(50),
  tax                 VARCHAR(20),
  tariff              VARCHAR(50),
  taxexemptionreason  VARCHAR(100),
  irbm_classification VARCHAR(20),
  taxrate             VARCHAR(20),
  taxamt              VARCHAR(30),
  localtaxamt         VARCHAR(30),
  exempted_taxrate    VARCHAR(20),
  exempted_taxamt     VARCHAR(30),
  taxinclusive        BOOLEAN,
  amount              VARCHAR(30),
  localamount         VARCHAR(30),
  taxableamt          VARCHAR(30),                   -- INV-specific: taxable amount
  amountwithtax       VARCHAR(30),
  account             VARCHAR(20),                   -- INV-specific: GL account code e.g. '500-2000'
  printable           BOOLEAN,
  fromdoctype         VARCHAR(10),
  fromdockey          INTEGER,
  fromdtlkey          INTEGER,
  transferable        BOOLEAN,
  remark1             VARCHAR(200),
  remark2             VARCHAR(200),
  companyitemcode     VARCHAR(50),
  sdsserialnumber     JSONB,
  initialpurchasecost VARCHAR(30),
  changed             BOOLEAN,
  CONSTRAINT inv_line_dtlkey_unique UNIQUE (dtlkey)
);

CREATE INDEX idx_inv_lines_dockey  ON sql_inv_lines(dockey);
CREATE INDEX idx_inv_lines_itemcode ON sql_inv_lines(itemcode);

-- ============================================================
-- RECEIPT VOUCHERS
-- Source: /receiptvoucher (confirmed accessible, docno prefix OR-)
-- Note: companyname is NULL — company name is in description field
-- No sdsdocdetail lines confirmed yet — header only for now
-- ============================================================
CREATE TABLE sql_receiptvouchers (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'OR-00001'
  doctype             VARCHAR(10),                   -- 'OR'
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  eiv_utc             TIMESTAMPTZ,
  eiv_received_utc    TIMESTAMPTZ,
  eiv_validated_utc   TIMESTAMPTZ,
  companyname         VARCHAR(200),                  -- NULL in SQL Account (use description)
  description         VARCHAR(200),                  -- company name is stored here
  description2        VARCHAR(200),                  -- 'Payment For Account'
  address1            VARCHAR(200),
  address2            VARCHAR(200),
  address3            VARCHAR(200),
  address4            VARCHAR(200),
  postcode            VARCHAR(20),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(10),
  phone1              VARCHAR(50),
  paymentmethod       VARCHAR(20),                   -- account code e.g. '310-1000'
  area                VARCHAR(50),
  agent               VARCHAR(50),
  project             VARCHAR(50),
  journal             VARCHAR(20),                   -- 'BANK'
  chequenumber        VARCHAR(50),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  bankcharge          VARCHAR(20),
  bankchargeaccount   VARCHAR(50),
  docamt              VARCHAR(30),
  localdocamt         VARCHAR(30),
  fromdoctype         VARCHAR(10),                   -- 'PM'
  bounceddate         DATE,
  gltransid           INTEGER,                       -- links to GL transaction
  cancelled           BOOLEAN DEFAULT FALSE,
  status              SMALLINT,
  depositkey          VARCHAR(50),
  fromdoc             VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  submissiontype      SMALLINT,
  irbm_status         SMALLINT,
  irbm_internalid     VARCHAR(100),
  irbm_uuid           VARCHAR(100),
  irbm_longid         VARCHAR(200),
  peppol_uuid         VARCHAR(100),
  peppol_docuuid      VARCHAR(100),
  updatecount         INTEGER,
  printcount          INTEGER,
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  sql_lastmodified    BIGINT,
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

CREATE INDEX idx_rv_dockey  ON sql_receiptvouchers(dockey);
CREATE INDEX idx_rv_docno   ON sql_receiptvouchers(docno);
CREATE INDEX idx_rv_lastmod ON sql_receiptvouchers(sql_lastmodified);

-- ============================================================
-- PURCHASE ORDERS
-- Source: /purchaseorder (78 fields — identical structure to SO)
-- ============================================================
CREATE TABLE sql_purchaseorders (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'PO-00002'
  docnoex             VARCHAR(30),
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  code                VARCHAR(20),                   -- supplier code '400-A001'
  companyname         VARCHAR(200),
  address1            VARCHAR(200),
  address2            VARCHAR(200),
  address3            VARCHAR(200),
  address4            VARCHAR(200),
  postcode            VARCHAR(20),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(10),
  phone1              VARCHAR(50),
  mobile              VARCHAR(50),
  fax1                VARCHAR(50),
  attention           VARCHAR(100),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  project             VARCHAR(50),
  terms               VARCHAR(50),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  shipper             VARCHAR(50),
  description         VARCHAR(200),
  cancelled           BOOLEAN DEFAULT FALSE,
  status              SMALLINT,
  docamt              VARCHAR(30),
  localdocamt         VARCHAR(30),
  d_docno             VARCHAR(30),
  d_paymentmethod     VARCHAR(50),
  d_chequenumber      VARCHAR(50),
  d_paymentproject    VARCHAR(50),
  d_bankcharge        VARCHAR(20),
  d_bankchargeaccount VARCHAR(50),
  d_amount            VARCHAR(20),
  validity            VARCHAR(50),
  deliveryterm        VARCHAR(100),
  cc                  VARCHAR(50),
  docref1             VARCHAR(200),                  -- supplier invoice ref
  docref2             VARCHAR(200),
  docref3             VARCHAR(200),
  docref4             VARCHAR(200),
  branchname          VARCHAR(200),
  daddress1           VARCHAR(200),
  daddress2           VARCHAR(200),
  daddress3           VARCHAR(200),
  daddress4           VARCHAR(200),
  dpostcode           VARCHAR(20),
  dcity               VARCHAR(100),
  dstate              VARCHAR(100),
  dcountry            VARCHAR(10),
  dattention          VARCHAR(100),
  dphone1             VARCHAR(50),
  dmobile             VARCHAR(50),
  dfax1               VARCHAR(50),
  taxexemptno         VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  incoterms           VARCHAR(50),
  submissiontype      SMALLINT,
  peppol_uuid         VARCHAR(100),
  businessunit        VARCHAR(100),
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  transferable        BOOLEAN,
  updatecount         INTEGER,
  printcount          INTEGER,
  sql_lastmodified    BIGINT,
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  occ_updated_at      TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

CREATE INDEX idx_po_dockey  ON sql_purchaseorders(dockey);
CREATE INDEX idx_po_docno   ON sql_purchaseorders(docno);
CREATE INDEX idx_po_code    ON sql_purchaseorders(code);
CREATE INDEX idx_po_lastmod ON sql_purchaseorders(sql_lastmodified);

-- ============================================================
-- PURCHASE INVOICES (Supplier Invoices / AP)
-- Source: /purchaseinvoice (83 fields)
-- Extra fields: landingcost1, landingcost2, localtotalwithcost
-- ============================================================
CREATE TABLE sql_purchaseinvoices (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'PI-00028'
  docnoex             VARCHAR(30),
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  eiv_utc             TIMESTAMPTZ,
  eiv_received_utc    TIMESTAMPTZ,
  eiv_validated_utc   TIMESTAMPTZ,
  code                VARCHAR(20),
  companyname         VARCHAR(200),
  address1            VARCHAR(200),
  address2            VARCHAR(200),
  address3            VARCHAR(200),
  address4            VARCHAR(200),
  postcode            VARCHAR(20),
  city                VARCHAR(100),
  state               VARCHAR(100),
  country             VARCHAR(10),
  phone1              VARCHAR(50),
  mobile              VARCHAR(50),
  fax1                VARCHAR(50),
  attention           VARCHAR(100),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  project             VARCHAR(50),
  terms               VARCHAR(50),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  shipper             VARCHAR(50),
  description         VARCHAR(200),
  cancelled           BOOLEAN DEFAULT FALSE,
  status              SMALLINT,
  docamt              VARCHAR(30),
  localdocamt         VARCHAR(30),
  landingcost1        VARCHAR(20),                   -- PI-specific: additional landing costs
  landingcost2        VARCHAR(20),
  localtotalwithcost  VARCHAR(30),                   -- PI-specific: total including landing costs
  d_amount            VARCHAR(20),
  validity            VARCHAR(50),
  deliveryterm        VARCHAR(100),
  cc                  VARCHAR(50),
  docref1             VARCHAR(200),                  -- supplier's invoice number
  docref2             VARCHAR(200),
  docref3             VARCHAR(200),
  docref4             VARCHAR(200),
  branchname          VARCHAR(200),
  daddress1           VARCHAR(200),
  daddress2           VARCHAR(200),
  daddress3           VARCHAR(200),
  daddress4           VARCHAR(200),
  dpostcode           VARCHAR(20),
  dcity               VARCHAR(100),
  dstate              VARCHAR(100),
  dcountry            VARCHAR(10),
  dattention          VARCHAR(100),
  dphone1             VARCHAR(50),
  dmobile             VARCHAR(50),
  dfax1               VARCHAR(50),
  taxexemptno         VARCHAR(50),
  salestaxno          VARCHAR(50),
  servicetaxno        VARCHAR(50),
  tin                 VARCHAR(50),
  idtype              SMALLINT,
  idno                VARCHAR(50),
  tourismno           VARCHAR(50),
  sic                 VARCHAR(20),
  incoterms           VARCHAR(50),
  submissiontype      SMALLINT,
  irbm_status         SMALLINT,
  irbm_internalid     VARCHAR(100),
  irbm_uuid           VARCHAR(100),
  irbm_longid         VARCHAR(200),
  peppol_uuid         VARCHAR(100),
  peppol_docuuid      VARCHAR(100),
  businessunit        VARCHAR(100),
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  transferable        BOOLEAN,
  updatecount         INTEGER,
  printcount          INTEGER,
  sql_lastmodified    BIGINT,
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

CREATE INDEX idx_pi_dockey  ON sql_purchaseinvoices(dockey);
CREATE INDEX idx_pi_docno   ON sql_purchaseinvoices(docno);
CREATE INDEX idx_pi_code    ON sql_purchaseinvoices(code);

-- ============================================================
-- SUPPLIER PAYMENTS (Payment Vouchers)
-- Source: /supplierpayment (40 fields, docno prefix PV-)
-- ============================================================
CREATE TABLE sql_supplierpayments (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'PV-00002'
  code                VARCHAR(20),                   -- supplier code
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  description         VARCHAR(200),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  paymentmethod       VARCHAR(20),                   -- account code '310-1000'
  chequenumber        VARCHAR(50),
  journal             VARCHAR(20),
  project             VARCHAR(50),
  paymentproject      VARCHAR(50),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  bankacc             VARCHAR(50),
  bankcharge          VARCHAR(20),
  bankchargeaccount   VARCHAR(50),
  docamt              VARCHAR(30),
  localdocamt         VARCHAR(30),
  unappliedamt        VARCHAR(30),
  docref1             VARCHAR(200),
  docref2             VARCHAR(200),
  fromdoctype         VARCHAR(10),
  fromdockey          INTEGER,
  gltransid           INTEGER,
  cancelled           BOOLEAN DEFAULT FALSE,
  status              SMALLINT,
  nonrefundable       BOOLEAN,
  bounceddate         DATE,
  updatecount         INTEGER,
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  sql_lastmodified    BIGINT,
  banktransfertype    SMALLINT,
  bankrefno           VARCHAR(100),
  bankstatus          VARCHAR(50),
  bankstatusdesc      VARCHAR(200),
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

CREATE INDEX idx_sp_dockey ON sql_supplierpayments(dockey);
CREATE INDEX idx_sp_code   ON sql_supplierpayments(code);

-- ============================================================
-- STOCK ADJUSTMENTS
-- Source: /stockadjustment (20 fields, docno prefix AJ-)
-- ============================================================
CREATE TABLE sql_stockadjustments (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'AJ-00001'
  docdate             DATE,
  postdate            DATE,
  description         VARCHAR(200),
  area                VARCHAR(50),
  agent               VARCHAR(50),
  writeoff            BOOLEAN,
  cancelled           BOOLEAN,
  status              SMALLINT,
  docamt              VARCHAR(30),
  attachments         JSONB,
  authby              VARCHAR(100),
  reason              TEXT,
  remark              TEXT,
  note                TEXT,
  approvestate        VARCHAR(20),
  updatecount         INTEGER,
  printcount          INTEGER,
  sql_lastmodified    BIGINT,
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

-- ============================================================
-- JOURNAL ENTRIES
-- Source: /journalentry (20 fields, docno prefix JV-)
-- Note: /generalledger (line items) is BLOCKED — header only for now
-- ============================================================
CREATE TABLE sql_journalentries (
  dockey              INTEGER      NOT NULL UNIQUE,
  docno               VARCHAR(30)  NOT NULL UNIQUE, -- 'JV-00001'
  docdate             DATE,
  postdate            DATE,
  taxdate             DATE,
  journal             VARCHAR(20),                   -- 'GENERAL'
  description         VARCHAR(200),
  currencycode        VARCHAR(10),
  currencyrate        VARCHAR(20),
  gltransid           INTEGER,                       -- GL transaction ID
  cancelled           BOOLEAN,
  status              SMALLINT,
  updatecount         INTEGER,
  printcount          INTEGER,
  attachments         JSONB,
  note                TEXT,
  approvestate        VARCHAR(20),
  fromdoctype         VARCHAR(10),
  fromdockey          INTEGER,
  sql_lastmodified    BIGINT,
  occ_period_id       INTEGER REFERENCES occ_periods(id),
  occ_synced_at       TIMESTAMPTZ DEFAULT NOW(),
  sql_raw             JSONB
);

-- ============================================================
-- OCC SYSTEM TABLES (not mirrored from SQL — OCC-native)
-- ============================================================

-- Sync log — every SQL Account pull recorded
CREATE TABLE occ_sync_log (
  id              SERIAL PRIMARY KEY,
  sync_type       VARCHAR(30) NOT NULL,
  endpoint        VARCHAR(100),
  started_at      TIMESTAMPTZ DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  status          VARCHAR(10) CHECK (status IN ('RUNNING','SUCCESS','PARTIAL','FAILED')),
  records_fetched INTEGER DEFAULT 0,
  records_upserted INTEGER DEFAULT 0,
  records_skipped INTEGER DEFAULT 0,
  last_dockey_seen INTEGER,
  last_lastmodified BIGINT,
  error_message   TEXT,
  duration_ms     INTEGER
);

-- Audit log — every OCC write action (immutable)
CREATE TABLE occ_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  entity_type     VARCHAR(50) NOT NULL,    -- 'salesorder', 'deliveryorder', etc
  entity_dockey   INTEGER,
  entity_docno    VARCHAR(30),
  action          VARCHAR(20) NOT NULL
                    CHECK (action IN ('CREATE','UPDATE','CANCEL','SYNC','LOGIN')),
  actor_username  VARCHAR(50),
  acted_at        TIMESTAMPTZ DEFAULT NOW(),
  before_state    JSONB,
  after_state     JSONB,
  sql_payload     JSONB,
  sql_response    JSONB,
  notes           TEXT
);

-- Block modifications to audit log
CREATE RULE occ_audit_no_update AS ON UPDATE TO occ_audit_log DO INSTEAD NOTHING;
CREATE RULE occ_audit_no_delete AS ON DELETE TO occ_audit_log DO INSTEAD NOTHING;

CREATE INDEX idx_audit_entity ON occ_audit_log(entity_type, entity_dockey);
CREATE INDEX idx_audit_actor  ON occ_audit_log(actor_username);
CREATE INDEX idx_audit_at     ON occ_audit_log(acted_at);

-- BOM (hardcoded from sync-bom.js — OCC-native, not in SQL Account API)
CREATE TABLE occ_bom_headers (
  id              SERIAL PRIMARY KEY,
  finished_code   VARCHAR(50) NOT NULL UNIQUE
                    REFERENCES sql_stockitems(code),
  bom_version     VARCHAR(10) NOT NULL DEFAULT '1.0',
  is_active       BOOLEAN DEFAULT TRUE,
  notes           TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE occ_bom_lines (
  id              SERIAL PRIMARY KEY,
  bom_id          INTEGER NOT NULL REFERENCES occ_bom_headers(id) ON DELETE CASCADE,
  component_code  VARCHAR(50) NOT NULL REFERENCES sql_stockitems(code),
  qty_per_unit    NUMERIC(18,6) NOT NULL,
  uom             VARCHAR(20) NOT NULL,
  wastage_pct     NUMERIC(5,2) DEFAULT 0,
  CONSTRAINT bom_line_unique UNIQUE (bom_id, component_code)
);

-- Production machines (OCC-native)
CREATE TABLE occ_machines (
  id              SERIAL PRIMARY KEY,
  machine_code    VARCHAR(20) NOT NULL UNIQUE,
  machine_name    VARCHAR(100) NOT NULL,
  machine_type    VARCHAR(50),
  rate_kg_per_hr  NUMERIC(10,2),
  is_active       BOOLEAN DEFAULT TRUE
);

INSERT INTO occ_machines (machine_code, machine_name, machine_type, rate_kg_per_hr) VALUES
('WFJ-20',   'WFJ-20 Fine Grinder',     'GRINDER', 56.0),
('WFC-500',  'WFC-500 Coarse Grinder',  'GRINDER', 19.1),
('LG-60B',   'LG-60B Pepper Grinder',   'GRINDER', 59.9),
('GS420',    'GS420 Auto Packer',       'PACKER',  600.0),
('AFM30-T',  'AFM30-T Semi-Auto Packer','PACKER',  125.0);

-- ============================================================
-- VIEWS — Useful queries built on real field names
-- ============================================================

-- Open SOs with balance (using real SQL Account field names)
CREATE VIEW v_open_salesorders AS
SELECT
  so.dockey,
  so.docno,
  so.docdate,
  so.code          AS customer_code,
  so.companyname,
  so.docamt,
  so.docref1       AS customer_po_ref,
  so.docref2       AS delivery_info,
  so.docref3       AS fulfillment_flag,
  so.status,
  so.cancelled,
  COUNT(sol.id)    AS line_count,
  SUM(sol.occ_qty) AS total_qty,
  SUM(sol.occ_offsetqty) AS total_delivered,
  SUM(sol.occ_balance)   AS total_balance
FROM sql_salesorders so
LEFT JOIN sql_so_lines sol ON sol.dockey = so.dockey
WHERE so.status = 0
  AND so.cancelled = FALSE
  AND (so.docref3 IS NULL OR UPPER(TRIM(so.docref3)) != 'DONE')
GROUP BY so.dockey, so.docno, so.docdate, so.code,
         so.companyname, so.docamt, so.docref1,
         so.docref2, so.docref3, so.status, so.cancelled;

-- DO → SO linkage view (using fromdockey/fromdtlkey)
CREATE VIEW v_do_so_linkage AS
SELECT
  do_.dockey   AS do_dockey,
  do_.docno    AS do_docno,
  do_.docdate  AS do_date,
  do_.code     AS customer_code,
  do_.companyname,
  dol.itemcode,
  dol.description,
  dol.occ_qty  AS do_qty,
  dol.fromdockey AS so_dockey,
  dol.fromdtlkey AS so_dtlkey,
  so.docno     AS so_docno
FROM sql_deliveryorders do_
JOIN sql_do_lines dol  ON dol.dockey = do_.dockey
LEFT JOIN sql_salesorders so ON so.dockey = dol.fromdockey
WHERE do_.cancelled = FALSE;

-- AR Outstanding (invoices not fully paid)
CREATE VIEW v_ar_outstanding AS
SELECT
  inv.dockey,
  inv.docno,
  inv.docdate,
  inv.code       AS customer_code,
  inv.companyname,
  inv.docamt,
  inv.terms,
  -- Calculate due date from terms
  CASE
    WHEN inv.terms LIKE '%30%' THEN inv.docdate + 30
    WHEN inv.terms LIKE '%60%' THEN inv.docdate + 60
    WHEN inv.terms LIKE '%90%' THEN inv.docdate + 90
    WHEN inv.terms = 'C.O.D.'  THEN inv.docdate
    ELSE inv.docdate + 30
  END AS due_date,
  CURRENT_DATE - CASE
    WHEN inv.terms LIKE '%30%' THEN inv.docdate + 30
    WHEN inv.terms LIKE '%60%' THEN inv.docdate + 60
    WHEN inv.terms LIKE '%90%' THEN inv.docdate + 90
    ELSE inv.docdate + 30
  END AS days_overdue
FROM sql_salesinvoices inv
WHERE inv.cancelled = FALSE
  AND inv.status = 0;

-- ============================================================
-- VERIFY
-- ============================================================
SELECT tablename,
       pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
