export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { contract } = req.query;
  if (!contract) return res.status(400).json({ error: "Missing contract" });

  try {
    const LCD = process.env.PAXI_LCD;
    const r = await fetch(`${LCD}/paxi/swap/pool/${contract}`);
    if (!r.ok) return res.status(r.status).json({ error: "LCD error", detail: await r.text() });
    const data = await r.json();
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || "pool fetch failed" });
  }
}
