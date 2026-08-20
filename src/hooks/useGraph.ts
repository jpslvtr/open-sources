import { useState, useEffect } from "react";
import { getGraph } from "../api/client";
import type { GraphResponse } from "../types/api";

export function useGraph(entityId: string | undefined, depth = 2) {
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    getGraph(entityId, depth)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "failed to load graph");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entityId, depth]);

  return { data, loading, error };
}
