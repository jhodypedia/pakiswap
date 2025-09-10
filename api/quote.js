export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { contract, amount } = req.query;
  if (!contract || !amount) return res.status(400).json({ error: "Missing contract/amount" });

  try {
    const LCD = process.env.PAXI_LCD;
    const r = await fetch(`${LCD}/paxi/swap/pool/${contract}`);
    if (!r.ok) return res.status(r.status).json({ error: "LCD error", detail: await r.text() });
    const pool = await r.json();

    const reservePaxi = parseFloat(pool.reserve_paxi || "0");
    const reservePrc20 = parseFloat(pool.reserve_prc20 || "0");
    const offerAmount = Number(amount);

    if (!reservePaxi || !reservePrc20) {
      return res.status(400).json({ error: "Pool reserves invalid" });
    }

    // x*y=k; out ≈ (offer * reserveOut) / (reserveIn + offer)
    const expectedOut = Math.floor((offerAmount * reservePaxi) / (reservePrc20 + offerAmount));

    // price impact (%)
    const priceBefore = reservePaxi / reservePrc20;
    const priceAfter = (reservePaxi - expectedOut) / (reservePrc20 + offerAmount);
    const priceImpact = ((priceAfter - priceBefore) / priceBefore) * 100;

    res.status(200).json({ reservePaxi, reservePrc20, expectedOut, priceImpact });
  } catch (e) {
    res.status(500).json({ error: e.message || "quote failed" });
  }
}
