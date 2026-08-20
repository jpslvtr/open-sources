import { useSearchParams } from "react-router-dom";
import { useSearch } from "../hooks/useSearch";
import { Filters } from "../components/Filters";
import { EntityCard } from "../components/EntityCard";
import { SectionHeader } from "../components/SectionHeader";
import { SkeletonRows } from "../components/Skeleton";

export function SearchPage() {
  const [searchParams] = useSearchParams();
  const initialQuery = searchParams.get("q") ?? "";
  const {
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
  } = useSearch(initialQuery);

  return (
    <div className="page">
      <div style={{ marginBottom: "2rem" }}>
        <h1
          className="fade-in"
          style={{
            fontSize: "36px",
            fontWeight: 700,
            letterSpacing: "-1px",
            lineHeight: 1,
            marginBottom: "0.5rem",
          }}
        >
          open sources
        </h1>
        <p
          className="fade-in"
          style={{
            animationDelay: "35ms",
            fontSize: "13px",
            color: "var(--fg3)",
            lineHeight: 1.5,
          }}
        >
          trace political money. search any candidate, committee, or donor.
        </p>
      </div>

      <div
        className="fade-in"
        style={{ animationDelay: "70ms", marginBottom: "1rem" }}
      >
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="search by name..."
          style={{
            width: "100%",
            padding: "0.625rem 0.75rem",
            border: "1px solid var(--border)",
            fontSize: "14px",
            outline: "none",
            transition: "border-color 0.15s",
          }}
          onFocus={(e) => {
            (e.target as HTMLInputElement).style.borderColor = "var(--fg3)";
          }}
          onBlur={(e) => {
            (e.target as HTMLInputElement).style.borderColor = "var(--border)";
          }}
        />
      </div>

      <div className="fade-in" style={{ animationDelay: "105ms" }}>
        <Filters filters={filters} onChange={setFilters} />
      </div>

      {error && (
        <div
          style={{
            padding: "0.75rem 1rem",
            border: "1px solid var(--border)",
            color: "var(--fg2)",
            fontSize: "12px",
            marginBottom: "1rem",
          }}
        >
          {error}
        </div>
      )}

      {loading && <SkeletonRows count={8} />}

      {!loading && results.length > 0 && (
        <div>
          <SectionHeader
            label={`${total.toLocaleString()} result${total !== 1 ? "s" : ""}`}
            source="fec.gov"
          />
          {results.map((r, i) => (
            <EntityCard key={r.entity.id} result={r} index={i} />
          ))}

          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn"
                disabled={page <= 1}
                onClick={() => loadPage(page - 1)}
                style={{ opacity: page <= 1 ? 0.3 : 1 }}
              >
                prev
              </button>
              <span className="pagination-label">
                {page} / {totalPages.toLocaleString()}
              </span>
              <button
                className="btn"
                disabled={page >= totalPages}
                onClick={() => loadPage(page + 1)}
                style={{ opacity: page >= totalPages ? 0.3 : 1 }}
              >
                next
              </button>
            </div>
          )}
        </div>
      )}

      {!loading && results.length === 0 && !error && (
        <div
          style={{
            textAlign: "center",
            color: "var(--fg4)",
            fontSize: "13px",
            padding: "3rem 0",
          }}
        >
          {query.length >= 2 ? `no results for "${query}"` : "no results found"}
        </div>
      )}
    </div>
  );
}
