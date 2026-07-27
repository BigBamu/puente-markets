const CLOB = "https://clob.polymarket.com";

export default async function handler(req, res) {
  const tokenId = String(req.query?.token_id || "").trim();
  if (!tokenId || !/^\d+$/.test(tokenId)) {
    return res.status(400).json({ error: "Giltigt token_id krävs" });
  }

  try {
    const response = await fetch(`${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`, {
      headers: { "Accept": "application/json", "User-Agent": "Puente-Markets-MVP/0.1" },
      signal: AbortSignal.timeout(10_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return res.status(response.status).json(data);

    const bids = Array.isArray(data.bids) ? data.bids : [];
    const asks = Array.isArray(data.asks) ? data.asks : [];
    const bestBid = bids.length ? Number(bids[0].price) : null;
    const bestAsk = asks.length ? Number(asks[0].price) : null;

    res.setHeader("Cache-Control", "s-maxage=3, stale-while-revalidate=5");
    res.status(200).json({
      ...data,
      bestBid,
      bestAsk,
      spread: bestBid !== null && bestAsk !== null ? Number((bestAsk - bestBid).toFixed(4)) : null
    });
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : "Orderboken kunde inte hämtas" });
  }
}
