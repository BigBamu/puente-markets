const CLOB = "https://clob.polymarket.com";
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const tokenId = String(url.searchParams.get("token_id") || "").trim();
    if (!tokenId || !/^\d+$/.test(tokenId)) return Response.json({error:"Giltigt token_id krävs"},{status:400});
    const controller = new AbortController(); const timeout=setTimeout(()=>controller.abort(),10000);
    try {
      const response=await fetch(`${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`,{headers:{Accept:"application/json","User-Agent":"Puente-Markets/0.2"},signal:controller.signal});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) return Response.json(data,{status:response.status});
      const bids=Array.isArray(data.bids)?data.bids:[]; const asks=Array.isArray(data.asks)?data.asks:[];
      const bestBid=bids.length?Number(bids[0].price):null; const bestAsk=asks.length?Number(asks[0].price):null;
      return Response.json({...data,bestBid,bestAsk,spread:bestBid!==null&&bestAsk!==null?Number((bestAsk-bestBid).toFixed(4)):null},
        {headers:{"Cache-Control":"s-maxage=3, stale-while-revalidate=5"}});
    } catch(error) { return Response.json({error:error instanceof Error?error.message:"Orderboken kunde inte hämtas"},{status:502}); }
    finally { clearTimeout(timeout); }
  }
};
