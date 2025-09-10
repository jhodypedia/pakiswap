export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { contract } = req.query;
  if (!contract) return res.status(400).json({ error: "Missing contract" });

  try {
    const LCD = process.env.PAXI_LCD;
    const msg = { token_info: {} };
    const b64 = Buffer.from(JSON.stringify(msg)).toString("base64");
    const url = `${LCD}/cosmwasm/wasm/v1/contract/${contract}/smart/${b64}`;

    const r = await fetch(url);
    const data = await r.json();

    if (!r.ok || data.code) {
      return res.status(r.status || 400).json({ error: "Query failed", detail: data });
    }

    const ti = data.data || data.result || data;
    res.status(200).json({
      name: ti.name,
      symbol: ti.symbol,
      decimals: Number(ti.decimals),
      total_supply: ti.total_supply
    });
  } catch (e) {
    res.status(500).json({ error: e.message || "token info failed" });
  }
}
