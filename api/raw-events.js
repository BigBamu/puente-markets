export default {
  async fetch() {
    try {
      const response = await fetch("https://gamma-api.polymarket.com/events?active=true&closed=false&limit=300", { headers:{Accept:"application/json","User-Agent":"Puente-Markets/0.2"} });
      const data = await response.json();
      return Response.json(data, { status: response.status, headers:{"Cache-Control":"s-maxage=20, stale-while-revalidate=60"} });
    } catch (error) {
      return Response.json({error:error instanceof Error?error.message:"Kunde inte hämta data"},{status:502});
    }
  }
};
