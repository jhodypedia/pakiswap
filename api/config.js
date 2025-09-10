export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const RPC = process.env.PAXI_RPC;
  const LCD = process.env.PAXI_LCD;
  const DENOM = process.env.PAXI_DENOM || "upaxi";
  const SWAP_MODULE_ADDR = process.env.SWAP_MODULE_ADDR;

  res.status(200).json({
    rpc: RPC,
    lcd: LCD,
    denom: DENOM,
    swapModuleAddress: SWAP_MODULE_ADDR
  });
}
