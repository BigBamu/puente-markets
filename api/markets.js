const GAMMA = "https://gamma-api.polymarket.com";

const FOOTBALL_HINTS = [
  "soccer", "football", "premier league", "la liga", "serie a", "bundesliga",
  "ligue 1", "champions league", "europa league", "conference league", "mls",
  "copa", "libertadores", "sudamericana", "world cup", "uefa", "fifa",
  "eredivisie", "primeira liga", "allsvenskan", "superettan", "liga mx",
  "brasileirao", "brasileirão", "argentina", "colombia", "sweden", "england",
  "spain", "italy", "germany", "france", "portugal", "netherlands"
];
const NON_FOOTBALL_HINTS = [
  "nba", "wnba", "basketball", "nfl", "american football", "mlb", "baseball",
  "nhl", "hockey", "tennis", "cricket", "mma", "ufc", "boxing", "golf",
  "formula 1", "nascar", "esports"
];

function parseArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return value.split(",").map((v) => v.trim()).filter(Boolean);
  }
}

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function isLikelyFootball(event, market) {
  const series = Array.isArray(event?.series) ? event.series : [];
  const tags = Array.isArray(event?.tags) ? event.tags : [];
  const text = [
    event?.title, event?.subtitle, event?.category, event?.subcategory,
    market?.question, market?.marketType, market?.sportsMarketType,
    ...series.flatMap((s) => [s?.title, s?.slug, s?.description]),
    ...tags.flatMap((t) => [t?.label, t?.slug])
  ].filter(Boolean).join(" ").toLowerCase();

  if (NON_FOOTBALL_HINTS.some((word) => text.includes(word))) return false;
  if (FOOTBALL_HINTS.some((word) => text.includes(word))) return true;

  // Most sports match events expose a game start time and use a matchup title.
  const title = String(event?.title || market?.question || "").toLowerCase();
  const matchup = /\b(vs\.?|v\.|versus)\b/.test(title) || title.includes(" - ");
  return Boolean((market?.gameStartTime || event?.gameStartTime) && matchup);
}

function normalizeMarket(market, event = null) {
  const outcomes = parseArray(market.outcomes);
  const outcomePrices = parseArray(market.outcomePrices).map(numeric);
  const tokenIds = parseArray(market.clobTokenIds);
  const yesIndex = Math.max(0, outcomes.findIndex((o) => String(o).toLowerCase() === "yes"));
  const noIndex = Math.max(0, outcomes.findIndex((o) => String(o).toLowerCase() === "no"));
  const eventObj = event || (Array.isArray(market.events) ? market.events[0] : null);

  return {
    id: String(market.id || market.conditionId || market.slug),
    conditionId: market.conditionId || market.conditionID || "",
    question: market.question || market.groupItemTitle || eventObj?.title || "Okänd marknad",
    slug: market.slug || "",
    eventTitle: eventObj?.title || market.question || "Polymarket",
    eventSlug: eventObj?.slug || "",
    image: market.icon || market.image || eventObj?.icon || eventObj?.image || "",
    category: market.sportsMarketType || market.marketType || market.formatType || "Övrigt",
    outcomes: outcomes.length ? outcomes : ["Yes", "No"],
    yesPrice: outcomePrices[yesIndex] ?? outcomePrices[0] ?? 0.5,
    noPrice: outcomePrices[noIndex] ?? outcomePrices[1] ?? 0.5,
    yesTokenId: tokenIds[yesIndex] || tokenIds[0] || "",
    noTokenId: tokenIds[noIndex] || tokenIds[1] || "",
    volume: numeric(market.volumeNum ?? market.volume),
    volume24h: numeric(market.volume24hr),
    liquidity: numeric(market.liquidityNum ?? market.liquidity),
    startTime: market.gameStartTime || eventObj?.gameStartTime || market.startDate || eventObj?.startDate || "",
    endTime: market.endDate || eventObj?.endDate || "",
    acceptingOrders: market.acceptingOrders !== false,
    isFootball: isLikelyFootball(eventObj, market),
    url: eventObj?.slug
      ? `https://polymarket.com/event/${eventObj.slug}`
      : market.slug
        ? `https://polymarket.com/market/${market.slug}`
        : "https://polymarket.com"
  };
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { "Accept": "application/json", "User-Agent": "Puente-Markets-MVP/0.1" },
    signal: AbortSignal.timeout(12_000)
  });
  if (!response.ok) throw new Error(`Polymarket svarade ${response.status}`);
  return response.json();
}

export default async function handler(req, res) {
  try {
    const limit = Math.min(Math.max(Number(req.query?.limit || 250), 20), 500);
    const events = await getJson(`${GAMMA}/events?active=true&closed=false&limit=${limit}`);
    const normalized = [];

    for (const event of Array.isArray(events) ? events : []) {
      for (const market of Array.isArray(event.markets) ? event.markets : []) {
        if (market.closed || market.active === false || market.enableOrderBook === false) continue;
        const item = normalizeMarket(market, event);
        if (item.isFootball) normalized.push(item);
      }
    }

    // Fallback: direct markets endpoint if event filtering returns too little.
    if (normalized.length < 5) {
      const markets = await getJson(`${GAMMA}/markets?active=true&closed=false&limit=${limit}`);
      for (const market of Array.isArray(markets) ? markets : []) {
        const item = normalizeMarket(market);
        if (item.isFootball && !normalized.some((m) => m.id === item.id)) normalized.push(item);
      }
    }

    normalized.sort((a, b) => (b.liquidity + b.volume24h) - (a.liquidity + a.volume24h));
    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    res.status(200).json({
      source: "polymarket",
      fetchedAt: new Date().toISOString(),
      count: normalized.length,
      markets: normalized.slice(0, limit)
    });
  } catch (error) {
    res.status(502).json({
      source: "error",
      fetchedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : "Kunde inte hämta marknader",
      markets: []
    });
  }
}
