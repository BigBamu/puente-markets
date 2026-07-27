import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const GAMMA = "https://gamma-api.polymarket.com";
const CLOB = "https://clob.polymarket.com";

const mime = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png"
};

async function proxy(url, res) {
  try {
    const upstream = await fetch(url, { signal: AbortSignal.timeout(12_000) });
    const body = await upstream.arrayBuffer();
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Cache-Control": "no-store"
    });
    res.end(Buffer.from(body));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : "Proxyfel" }));
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  if (url.pathname === "/api/raw-events") {
    return proxy(`${GAMMA}/events?active=true&closed=false&limit=500`, res);
  }
  if (url.pathname === "/api/orderbook") {
    const tokenId = url.searchParams.get("token_id") || "";
    if (!/^\d+$/.test(tokenId)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Giltigt token_id krävs" }));
    }
    return proxy(`${CLOB}/book?token_id=${encodeURIComponent(tokenId)}`, res);
  }

  let filePath = url.pathname === "/" ? path.join(__dirname, "index.html") : path.join(__dirname, url.pathname);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403); return res.end("Forbidden");
  }
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) filePath = path.join(filePath, "index.html");
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": mime[path.extname(filePath)] || "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
});

server.listen(PORT, () => console.log(`Puente Markets kör på http://localhost:${PORT}`));
