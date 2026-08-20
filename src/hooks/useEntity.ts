import { useState, useEffect, useCallback } from "react";
import { getEntity, getContributions } from "../api/client";
import type { Entity, EntityStats, Contribution } from "../types/entities";

export function useEntity(entityId: string | undefined) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [stats, setStats] = useState<EntityStats | null>(null);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!entityId) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getEntity(entityId)
      .then((res) => {
        if (cancelled) return;
        setEntity(res.entity);
        setStats(res.stats);
        setDataAsOf(res.dataAsOf);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load entity");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [entityId]);

  return { entity, stats, dataAsOf, loading, error };
}

export function useContributions(entityId: string | undefined, direction: "received" | "given") {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [total, setTotal] = useState(0);
  const [dataAsOf, setDataAsOf] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const load = useCallback(async (p: number) => {
    if (!entityId) return;
    setLoading(true);
    setError(null);

    try {
      const res = await getContributions(entityId, direction, p);
      setContributions(res.contributions);
      setTotal(res.total);
      setDataAsOf(res.dataAsOf);
      setPage(p);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contributions");
    } finally {
      setLoading(false);
    }
  }, [entityId, direction]);

  useEffect(() => {
    load(1);
  }, [load]);

  return { contributions, total, dataAsOf, loading, error, page, loadPage: load };
}
