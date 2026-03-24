export const config = {
  api: { bodyParser: { sizeLimit: '10mb' } }
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { messages, pdfBase64, fileName } = req.body;
    if (!messages || !messages.length) return res.status(400).json({ error: "No messages provided" });

    // Get the text prompt (customer list + stock items + instructions)
    const textPrompt = typeof messages[0].content === 'string'
      ? messages[0].content
      : messages[0].content.filter(b => b.type === 'text').map(b => b.text).join('\n');

    let responseText;

    if (pdfBase64) {
      // ── PDF: use Claude (reads PDFs natively and accurately) ──
      const anthropicKey = process.env.ANTHROPIC_API_KEY;
      if (!anthropicKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in Vercel environment variables. Please add it in Vercel → Settings → Environment Variables." });

      const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': anthropicKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 2000,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'document',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: pdfBase64,
                }
              },
              {
                type: 'text',
                text: textPrompt
              }
            ]
          }]
        })
      });

      const claudeData = await claudeRes.json();
      if (claudeData.error) return res.status(400).json({ error: claudeData.error.message || JSON.stringify(claudeData.error) });
      responseText = claudeData.content?.[0]?.text || '{}';

    } else {
      // ── Images / plain text: use GPT-4o ──
      const openaiMessages = messages.map(m => {
        if (typeof m.content === 'string') return { role: m.role, content: m.content };
        const parts = [];
        for (const block of m.content) {
          if (block.type === 'text') parts.push({ type: 'text', text: block.text });
          else if (block.type === 'image_url') parts.push(block);
          else if (block.type === 'image' && block.source)
            parts.push({ type: 'image_url', image_url: { url: `data:${block.source.media_type};base64,${block.source.data}` } });
        }
        return { role: m.role, content: parts.length === 1 && parts[0].type === 'text' ? parts[0].text : parts };
      });

      const gptRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 2000,
          messages: openaiMessages,
          response_format: { type: 'json_object' },
        }),
      });

      const gptData = await gptRes.json();
      if (gptData.error) return res.status(400).json({ error: gptData.error.message });
      responseText = gptData.choices?.[0]?.message?.content || '{}';
    }

    // Strip any markdown fences and return
    const clean = responseText.replace(/```json|```/g, '').trim();
    return res.status(200).json({ content: [{ type: 'text', text: clean }] });

  } catch (err) {
    console.error('Extract PO error:', err);
    return res.status(500).json({ error: err.message });
  }
}
