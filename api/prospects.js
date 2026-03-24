import { createClient } from 'redis';

const PROSPECTS_KEY = 'mazza_prospects';
const DEALS_KEY = 'mazza_deals';

async function getClient() {
  const client = createClient({ url: process.env.REDIS_URL });
  await client.connect();
  return client;
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const client = await getClient();
  try {
    if (req.method === "GET") {
      const type = req.query?.type;

      if (type === "deals") {
        const data = await client.get(DEALS_KEY);
        return res.status(200).json({ deals: data ? JSON.parse(data) : [] });
      }

      if (type === "so") {
        // Full SO + invoice + DO data for Document Tracker
        const [soRaw, ivRaw, doRaw] = await Promise.all([
          client.get('mazza_so'),
          client.get('mazza_invoice'),
          client.get('mazza_do'),
        ]);
        const soList = soRaw ? JSON.parse(soRaw) : [];
        const ivList = ivRaw ? JSON.parse(ivRaw) : [];
        const doList = doRaw ? JSON.parse(doRaw) : [];
        // Only return active/open SOs
        const openSOs = soList.filter(s => {
          const st = (s.status||'').toUpperCase();
          return !st.startsWith('DONE') && !st.startsWith('CANCEL') && st !== 'CANCELLED';
        });
        return res.status(200).json({ so: openSOs, invoice: ivList, dos: doList });
      }

      if (type === "so_legacy") {
        const [so, invoice, rv, po, catmap, updated] = await Promise.all([
          client.get('mazza_so'),
          client.get('mazza_invoice'),
          client.get('mazza_rv'),
          client.get('mazza_po'),
          client.get('mazza_catmap'),
          client.get('mazza_so_updated'),
        ]);
        return res.status(200).json({
          so:      so      ? JSON.parse(so)      : [],
          invoice: invoice ? JSON.parse(invoice) : [],
          rv:      rv      ? JSON.parse(rv)      : [],
          po:      po      ? JSON.parse(po)      : [],
          catmap:  catmap  ? JSON.parse(catmap)  : { spices:0, oil:0, flour:0, rawmat:0 },
          updated: updated || null,
        });
      }

      if (type === "master") {
        const [customers, stockitems] = await Promise.all([
          client.get('mazza_customers'),
          client.get('mazza_stockitems'),
        ]);
        return res.status(200).json({
          customers:  customers  ? JSON.parse(customers)  : [],
          stockitems: stockitems ? JSON.parse(stockitems) : [],
        });
      }

      if (type === "po_intake_list") {
        const data = await client.get('mazza_po_intake');
        return res.status(200).json({ list: data ? JSON.parse(data) : [] });
      }

      if (type === "po_list") {
        // Supplier POs from SQL Account sync
        const raw = await client.get('mazza_po');
        const pos = raw ? JSON.parse(raw) : [];
        // Enrich with line item count and offsetPct from mazza_do matching
        return res.status(200).json({ pos: pos.map(p => ({
          id:           p.id,
          supplier:     p.supplier,
          date:         p.date,
          amount:       p.amount,
          status:       p.status || 'Active',
          deliveryDate: p.delivery || null,
          itemCount:    p.itemCount || null,
          offsetPct:    p.status === 'DONE' || p.status === 'Cancelled' ? 100 : 0,
        }))});
      }

      if (type === "pv_list") {
        // Payment vouchers from SQL Account sync
        const raw = await client.get('mazza_pv');
        const pvs = raw ? JSON.parse(raw) : [];
        // Fallback to receipt vouchers if no PV key
        if (!pvs.length) {
          const rvRaw = await client.get('mazza_rv');
          const rvs = rvRaw ? JSON.parse(rvRaw) : [];
          return res.status(200).json({ pvs: rvs.map(r => ({
            id: r.id, description: r.customer, date: r.date, amount: r.amount,
            paymentMethod: '—', journal: '—', cancelled: false,
          }))});
        }
        return res.status(200).json({ pvs });
      }

      if (type === "grn_history") {
        const raw = await client.get('mazza_grn_history');
        return res.status(200).json({ list: raw ? JSON.parse(raw) : [] });
      }

      if (type === "pending_grns") {
        const raw = await client.get('mazza_grn_pending');
        const all = raw ? JSON.parse(raw) : [];
        return res.status(200).json({ grns: all.filter(g => !g.approved) });
      }

      if (type === "bom") {
        const data = await client.get('mazza_bom');
        return res.status(200).json({ bom: data ? JSON.parse(data) : {} });
      }

      if (type === "demand") {
        const [dos, po, updated] = await Promise.all([
          client.get('mazza_do'),
          client.get('mazza_po'),
          client.get('mazza_so_updated'),
        ]);
        return res.status(200).json({
          dos:  dos  ? JSON.parse(dos)  : [],
          pos:  po   ? JSON.parse(po)   : [],
          updated: updated || null,
        });
      }

      const data = await client.get(PROSPECTS_KEY);
      return res.status(200).json({ prospects: data ? JSON.parse(data) : null });
    }

    if (req.method === "POST") {
      const { prospects, deals, po } = req.body;

      // Handle PO intake submission
      if (po !== undefined) {
        const existing = await client.get('mazza_po_intake');
        const list = existing ? JSON.parse(existing) : [];
        list.unshift(po); // newest first
        await client.set('mazza_po_intake', JSON.stringify(list.slice(0, 200))); // keep last 200
        return res.status(200).json({ success: true, id: po.id });
      }
      if (deals !== undefined) {
        await client.set(DEALS_KEY, JSON.stringify(deals));
        return res.status(200).json({ success: true });
      }
      if (!prospects || !Array.isArray(prospects)) {
        return res.status(400).json({ error: "Invalid data" });
      }
      await client.set(PROSPECTS_KEY, JSON.stringify(prospects));
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    console.error("Redis error:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    await client.disconnect();
  }
}
