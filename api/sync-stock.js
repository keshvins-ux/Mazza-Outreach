// ============================================================
// STOCK BALANCE + REORDER SYNC
// File: /api/sync-stock.js
// Uses /stockbalanceinquiry (replaces blocked /stockbalance)
// Also syncs /stockreorderadvice for purchase suggestions
// Run on cron: every 15 minutes
// ============================================================

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const SQL_BASE = process.env.SQL_ACCOUNT_API_URL;
const SQL_KEY  = process.env.SQL_ACCOUNT_API_KEY;

async function fetchSQL(endpoint, params = {}) {
  const url = new URL(`${SQL_BASE}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));
  const res = await fetch(url.toString(), {
    headers: { 'Authorization': `Bearer ${SQL_KEY}`, 'Accept': 'application/json' }
  });
  if (!res.ok) throw new Error(`${endpoint} error: ${res.status}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data.data || data.records || []);
}

export default async function handler(req, res) {
  if (req.headers['x-cron-secret'] !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const client = await pool.connect();

  try {
    // Create tables if needed
    await client.query(`
      CREATE TABLE IF NOT EXISTS sql_stockbalance (
        itemcode      VARCHAR(30) PRIMARY KEY,
        description   VARCHAR(200),
        uom           VARCHAR(20),
        qty_on_hand   DECIMAL(18,4),
        qty_committed DECIMAL(18,4),
        qty_available DECIMAL(18,4),
        reorder_level DECIMAL(18,4),
        cost_price    DECIMAL(18,4),
        sell_price    DECIMAL(18,4),
        location      VARCHAR(50),
        syncdate      TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sql_reorderadvice (
        itemcode      VARCHAR(30) PRIMARY KEY,
        description   VARCHAR(200),
        qty_on_hand   DECIMAL(18,4),
        qty_committed DECIMAL(18,4),
        reorder_level DECIMAL(18,4),
        reorder_qty   DECIMAL(18,4),
        supplier_code VARCHAR(20),
        supplier_name VARCHAR(200),
        syncdate      TIMESTAMP DEFAULT NOW()
      );
    `);

    // Sync stock balance
    const stockData = await fetchSQL('stockbalanceinquiry');
    console.log(`[STOCK SYNC] Fetched ${stockData.length} stock items`);

    await client.query('BEGIN');

    for (const s of stockData) {
      await client.query(`
        INSERT INTO sql_stockbalance
          (itemcode, description, uom, qty_on_hand, qty_committed,
           qty_available, reorder_level, cost_price, sell_price, location, syncdate)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
        ON CONFLICT (itemcode) DO UPDATE SET
          description   = EXCLUDED.description,
          qty_on_hand   = EXCLUDED.qty_on_hand,
          qty_committed = EXCLUDED.qty_committed,
          qty_available = EXCLUDED.qty_available,
          reorder_level = EXCLUDED.reorder_level,
          cost_price    = EXCLUDED.cost_price,
          sell_price    = EXCLUDED.sell_price,
          syncdate      = NOW()
      `, [
        s.itemcode, s.description, s.uom, s.qtyonhand || s.qty_on_hand || 0,
        s.qtycommitted || s.qty_committed || 0,
        s.qtyavailable || s.qty_available || 0,
        s.reorderlevel || s.reorder_level || 0,
        s.costprice || s.cost_price || 0,
        s.sellprice || s.sell_price || 0,
        s.location || ''
      ]);
    }

    // Sync reorder advice
    try {
      const reorderData = await fetchSQL('stockreorderadvice');
      console.log(`[STOCK SYNC] Fetched ${reorderData.length} reorder items`);

      for (const r of reorderData) {
        await client.query(`
          INSERT INTO sql_reorderadvice
            (itemcode, description, qty_on_hand, qty_committed,
             reorder_level, reorder_qty, supplier_code, supplier_name, syncdate)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
          ON CONFLICT (itemcode) DO UPDATE SET
            description   = EXCLUDED.description,
            qty_on_hand   = EXCLUDED.qty_on_hand,
            qty_committed = EXCLUDED.qty_committed,
            reorder_level = EXCLUDED.reorder_level,
            reorder_qty   = EXCLUDED.reorder_qty,
            supplier_code = EXCLUDED.supplier_code,
            supplier_name = EXCLUDED.supplier_name,
            syncdate      = NOW()
        `, [
          r.itemcode, r.description,
          r.qtyonhand || 0, r.qtycommitted || 0,
          r.reorderlevel || 0, r.reorderqty || 0,
          r.suppliercode || '', r.suppliername || ''
        ]);
      }
    } catch (e) {
      console.log('[STOCK SYNC] Reorder advice skipped:', e.message);
    }

    await client.query('COMMIT');
    return res.status(200).json({
      success: true,
      stock_synced: stockData.length
    });

  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
}
