-- ============================================================
-- AR OUTSTANDING FIX
-- Computes real outstanding per invoice from RV payments
-- Run this in psql to verify before deploying
-- ============================================================

-- Step 1: Check current state (should mostly return 0)
SELECT 
  dockey,
  docno,
  docdate,
  code as customer_code,
  outstanding,
  totalamt
FROM sql_salesinvoices
WHERE outstanding = 0
LIMIT 10;

-- Step 2: The fix — compute outstanding from RV offsets
-- RV (Receipt Voucher) links back to invoice via knockoffkey
SELECT 
  iv.dockey,
  iv.docno,
  iv.docdate,
  iv.code,
  iv.totalamt,
  COALESCE(SUM(rv.knockoffamt), 0) as total_paid,
  iv.totalamt - COALESCE(SUM(rv.knockoffamt), 0) as computed_outstanding
FROM sql_salesinvoices iv
LEFT JOIN sql_receiptvouchers rv 
  ON rv.knockoffkey = iv.dockey
  AND rv.cancelled = 0
GROUP BY iv.dockey, iv.docno, iv.docdate, iv.code, iv.totalamt
ORDER BY iv.docdate DESC
LIMIT 20;

-- Step 3: AR Aging view
-- Buckets: Current, 1-30, 31-60, 61-90, 90+
SELECT
  iv.code as customer_code,
  iv.companyname,
  SUM(CASE WHEN age <= 0 THEN outstanding ELSE 0 END) as current_amt,
  SUM(CASE WHEN age BETWEEN 1 AND 30 THEN outstanding ELSE 0 END) as days_1_30,
  SUM(CASE WHEN age BETWEEN 31 AND 60 THEN outstanding ELSE 0 END) as days_31_60,
  SUM(CASE WHEN age BETWEEN 61 AND 90 THEN outstanding ELSE 0 END) as days_61_90,
  SUM(CASE WHEN age > 90 THEN outstanding ELSE 0 END) as days_over_90,
  SUM(outstanding) as total_outstanding
FROM (
  SELECT
    iv.dockey,
    iv.code,
    iv.companyname,
    iv.docdate,
    DATE_PART('day', NOW() - iv.docdate::timestamp) as age,
    iv.totalamt - COALESCE(SUM(rv.knockoffamt), 0) as outstanding
  FROM sql_salesinvoices iv
  LEFT JOIN sql_receiptvouchers rv 
    ON rv.knockoffkey = iv.dockey
    AND rv.cancelled = 0
  WHERE iv.cancelled = 0
  GROUP BY iv.dockey, iv.code, iv.companyname, iv.docdate, iv.totalamt
  HAVING iv.totalamt - COALESCE(SUM(rv.knockoffamt), 0) > 0
) aged
GROUP BY customer_code, companyname
ORDER BY total_outstanding DESC;
