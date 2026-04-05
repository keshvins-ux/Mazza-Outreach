require('dotenv').config();
const fs = require('fs');
const { createClient } = require('redis');

async function seed() {
  const redis = createClient({ url: process.env.REDIS_URL });
  redis.on('error', e => console.error('Redis error:', e.message));
  await redis.connect();
  console.log('Connected to Redis...');

  const lines    = JSON.parse(fs.readFileSync('/opt/mazza-sync/so_lines_20march2026.json', 'utf8'));
  const products = JSON.parse(fs.readFileSync('/opt/mazza-sync/so_by_product_20march2026.json', 'utf8'));

  const byProductMap = {};
  for (const p of products) byProductMap[p.itemCode] = p;

  const flatLines = [];
  for (const so of lines) {
    for (const line of so.lines) {
      flatLines.push({ docNo: so.soNo, itemCode: line.itemCode, description: line.description, uom: line.uom, balQty: line.qty, unitPrice: line.unitPrice, customer: so.customer, docDate: so.date });
    }
  }

  const meta = {
    uploadedAt: new Date().toISOString(),
    fileName: 'Clearer_Mazza.docx (20 Mar 2026)',
    parsedLines: flatLines.length,
    productCount: products.length,
    soCount: lines.length,
    totalValue: products.reduce((s,p) => s + p.totalValue, 0)
  };

  await redis.set('so:lines',        JSON.stringify(flatLines));
  await redis.set('so:by_product',   JSON.stringify(byProductMap));
  await redis.set('so:preview_meta', JSON.stringify(meta));
  await redis.set('so:index',        JSON.stringify(lines.map(s => s.soNo)));
  for (const so of lines) await redis.set(`so:header:${so.soNo}`, JSON.stringify(so));

  console.log('✅ Done!');
  console.log('   SOs:      ' + lines.length);
  console.log('   Products: ' + products.length);
  console.log('   Value:    RM ' + meta.totalValue.toLocaleString());
  await redis.quit();
}

seed().catch(e => { console.error('❌', e.message); process.exit(1); });
