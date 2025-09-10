export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { tx_bytes, mode } = req.body || {};
    if (!tx_bytes) return res.status(400).json({ error: "tx_bytes required" });

    const LCD = process.env.PAXI_LCD;
    const r = await fetch(`${LCD}/cosmos/tx/v1beta1/txs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tx_bytes, mode: mode || "BROADCAST_MODE_SYNC" })
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json(data);
    res.status(200).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message || "broadcast failed" });
  }
}
