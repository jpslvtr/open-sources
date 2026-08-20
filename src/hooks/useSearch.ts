import { useState, useEffect, useCallback } from "react";
import { search } from "../api/client";
import { useDebounce } from "./useDebounce";
import type { SearchFilters, SearchResult } from "../types/entities";

const DEFAULT_FILTERS: SearchFilters = {
  type: "all",
  level: "all",
  party: "all",
  state: "all",
  cycle: "all",
};

const PER_PAGE = 20;

export function useSearch(initialQuery = "") {
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const debouncedQuery = useDebounce(query, 300);

  const doSearch = useCallback(async (q: string, f: SearchFilters, p: number) => {
    setLoading(true);
    setError(null);

    try {
      const res = await search({ query: q, filters: f, page: p, perPage: PER_PAGE });
      setResults(res.results);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
      setResults([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPage(1);
    doSearch(debouncedQuery, filters, 1);
  }, [debouncedQuery, filters, doSearch]);

  const loadPage = useCallback((p: number) => {
    setPage(p);
    doSearch(debouncedQuery, filters, p);
  }, [debouncedQuery, filters, doSearch]);

  const totalPages = Math.ceil(total / PER_PAGE);

  return {
    query,
    setQuery,
    filters,
    setFilters,
    results,
    total,
    totalPages,
    loading,
    error,
    page,
    loadPage,
  };
}
