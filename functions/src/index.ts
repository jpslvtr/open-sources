import { onRequest } from "firebase-functions/v2/https";
import { handleSearch } from "./routes/search";
import { handleGetEntity, handleGetContributions } from "./routes/entity";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}


export const api = onRequest({ cors: true, region: "us-central1" }, async (req, res) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    res.set(corsHeaders());
    res.status(204).send("");
    return;
  }

  const path = req.path.replace(/^\/api/, "").replace(/\/$/, "");

  try {
    // POST /api/search
    if (path === "/search" && req.method === "POST") {
      const { query, filters, page = 1, perPage = 20 } = req.body;
      const result = await handleSearch({
        query: query ?? "",
        type: filters?.type ?? "all",
        level: filters?.level ?? "all",
        party: filters?.party ?? "all",
        state: filters?.state ?? "all",
        cycle: filters?.cycle ?? "all",
        page,
        perPage: Math.min(perPage, 50),
      });
      res.set(corsHeaders());
      res.json(result);
      return;
    }

    // GET /api/entity/:id
    const entityMatch = path.match(/^\/entity\/([^/]+)$/);
    if (entityMatch && req.method === "GET") {
      const entityId = decodeURIComponent(entityMatch[1]);
      const result = await handleGetEntity(entityId);
      res.set(corsHeaders());
      res.json(result);
      return;
    }

    // GET /api/entity/:id/contributions
    const contribMatch = path.match(/^\/entity\/([^/]+)\/contributions$/);
    if (contribMatch && req.method === "GET") {
      const entityId = decodeURIComponent(contribMatch[1]);
      const direction = (req.query.direction as string) === "given" ? "given" : "received";
      const page = parseInt(req.query.page as string) || 1;
      const perPage = Math.min(parseInt(req.query.perPage as string) || 30, 100);
      const result = await handleGetContributions(entityId, direction, page, perPage);
      res.set(corsHeaders());
      res.json(result);
      return;
    }

    res.set(corsHeaders());
    res.status(404).json({ error: "Not found" });
  } catch (err) {
    console.error("API error:", err);
    res.set(corsHeaders());
    res.status(500).json({ error: err instanceof Error ? err.message : "Internal error" });
  }
});
