export default async function handler(req, res) {
  try {
    const response = await fetch(
      "https://gamma-api.polymarket.com/events?active=true&closed=false&limit=300",
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "Puente-Markets/0.2",
        },
      }
    );

    const data = await response.json();

    res.setHeader("Cache-Control", "s-maxage=20, stale-while-revalidate=60");
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(502).json({
      error: error instanceof Error ? error.message : "Kunde inte hämta data",
    });
  }
}
