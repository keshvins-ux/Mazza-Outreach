import { createClient } from 'redis';

const KEY = 'mazza_activity';
const MAX_LOGS = 200;

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
      const data = await client.get(KEY);
      return res.status(200).json({ logs: data ? JSON.parse(data) : [] });
    }
    if (req.method === "POST") {
      const { entry } = req.body;
      const data = await client.get(KEY);
      const logs = data ? JSON.parse(data) : [];
      const updated = [entry, ...logs].slice(0, MAX_LOGS);
      await client.set(KEY, JSON.stringify(updated));
      return res.status(200).json({ success: true });
    }
  } catch (err) {
    console.error("Redis error:", err);
    return res.status(500).json({ error: err.message });
  } finally {
    await client.disconnect();
  }
}
