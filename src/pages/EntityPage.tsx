import { useParams, Link, useNavigate } from "react-router-dom";
import { useEntity, useContributions } from "../hooks/useEntity";
import { useGraph } from "../hooks/useGraph";
import { SectionHeader } from "../components/SectionHeader";
import { StatTiles, entityStatsToTiles } from "../components/StatTiles";
import { ContributionTable } from "../components/ContributionTable";
import { DataFreshness } from "../components/DataFreshness";
import { NetworkGraph } from "../components/NetworkGraph";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { formatCurrency } from "../utils/format";
import { useState, useRef, useEffect, useCallback } from "react";

const PARTY_LABELS: Record<string, string> = {
  DEM: "Democrat",
  REP: "Republican",
  IND: "Independent",
  LIB: "Libertarian",
  GRN: "Green",
};

export function EntityPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const entityId = id ? decodeURIComponent(id) : undefined;
  const { entity, stats, dataAsOf, loading, error } = useEntity(entityId);
  const [direction, setDirection] = useState<"received" | "given">("received");
  const contributions = useContributions(entityId, direction);
  const graphResult = useGraph(entityId, 1);
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphWidth, setGraphWidth] = useState(700);

  useEffect(() => {
    const el = graphContainerRef.current;
    if (!el) return;
    const measure = () => setGraphWidth(el.clientWidth);
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith("fec:")) {
      navigate(`/entity/${encodeURIComponent(nodeId)}`);
    } else if (nodeId.startsWith("name:")) {
      navigate(`/?q=${encodeURIComponent(nodeId.replace(/^name:/, ""))}`);
    }
  }, [navigate]);

  if (loading) {
    return (
      <div className="page">
        <Skeleton width="60%" height="2rem" style={{ marginBottom: "0.5rem" }} />
        <Skeleton width="40%" height="1rem" style={{ marginBottom: "1.5rem" }} />
        <div className="stat-tiles" style={{ marginBottom: "1.5rem" }}>
          {[1, 2, 3].map((i) => (
            <div key={i} className="stat-tile">
              <Skeleton width="60%" height="1.5rem" style={{ margin: "0 auto 0.25rem" }} />
              <Skeleton width="40%" height="0.75rem" style={{ margin: "0 auto" }} />
            </div>
          ))}
        </div>
        <SkeletonRows count={8} />
      </div>
    );
  }

  if (error || !entity) {
    return (
      <div className="page">
        <nav className="breadcrumb">
          <Link to="/">search</Link>
        </nav>
        <div style={{ color: "var(--fg3)", textAlign: "center", padding: "3rem 0" }}>
          {error ?? "entity not found"}
        </div>
      </div>
    );
  }

  const partyLabel = entity.party ? PARTY_LABELS[entity.party] ?? entity.party : null;
  const subtitle = [
    entity.type,
    partyLabel,
    entity.state,
    entity.office,
  ].filter(Boolean).join(" - ");

  return (
    <div className="page">
      <nav className="breadcrumb fade-in">
        <Link to="/">search</Link>
        <span className="breadcrumb-sep">/</span>
        <span>{entity.canonicalName.toLowerCase()}</span>
      </nav>

      <div className="fade-in" style={{ animationDelay: "35ms", marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontSize: "28px",
            fontWeight: 700,
            letterSpacing: "-0.5px",
            lineHeight: 1.1,
            marginBottom: "0.25rem",
          }}
        >
          {entity.canonicalName}
        </h1>
        <div style={{ fontSize: "12px", color: "var(--fg3)", marginBottom: "0.25rem" }}>
          {subtitle}
        </div>
        <DataFreshness date={dataAsOf} />
      </div>

      {stats && (
        <StatTiles stats={entityStatsToTiles(stats)} baseDelay={70} />
      )}

      {/* Inline graph preview */}
      <div className="fade-in" style={{ animationDelay: "105ms", marginBottom: "1.5rem" }}>
        <div style={{
          display: "flex", alignItems: "baseline", justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}>
          <span className="section-label">money network</span>
          <Link
            to={`/entity/${encodeURIComponent(entity.id)}/graph`}
            className="btn"
          >
            expand
          </Link>
        </div>
        <div ref={graphContainerRef} className="graph-preview">
          {graphResult.loading ? (
            <div style={{ padding: "2rem" }}>
              <SkeletonRows count={3} />
            </div>
          ) : graphResult.data && graphResult.data.nodes.length > 1 ? (
            <NetworkGraph
              data={graphResult.data}
              onNodeClick={handleNodeClick}
              width={graphWidth}
              height={350}
            />
          ) : (
            <div style={{
              textAlign: "center", color: "var(--fg4)", fontSize: "12px",
              padding: "2rem 0",
            }}>
              no network data
            </div>
          )}
        </div>
      </div>

      {stats && stats.cycles.length > 0 && (
        <div className="fade-in" style={{ animationDelay: "140ms", marginBottom: "1.5rem" }}>
          <SectionHeader label="by cycle" source="fec.gov" />
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {stats.cycles
              .sort((a, b) => b.cycle - a.cycle)
              .map((c) => {
                const maxAmount = Math.max(...stats.cycles.map((cy) => cy.received));
                const pct = maxAmount > 0 ? (c.received / maxAmount) * 100 : 0;
                return (
                  <div key={c.cycle}>
                    <div style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "11px",
                      color: "var(--fg3)",
                      marginBottom: "2px",
                    }}>
                      <span>{c.cycle}</span>
                      <span>{formatCurrency(c.received)}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      <div className="fade-in" style={{ animationDelay: "175ms", marginBottom: "1.5rem" }}>
        <SectionHeader label="contributions" source="fec.gov" />
        <div className="filter-row" style={{ marginBottom: "0.75rem" }}>
          <button
            className={`btn${direction === "received" ? " active" : ""}`}
            onClick={() => setDirection("received")}
          >
            received
          </button>
          <button
            className={`btn${direction === "given" ? " active" : ""}`}
            onClick={() => setDirection("given")}
          >
            given
          </button>
        </div>
        {contributions.loading ? (
          <SkeletonRows count={8} />
        ) : (
          <ContributionTable
            contributions={contributions.contributions}
            direction={direction}
            baseDelay={210}
          />
        )}
        {contributions.total > 30 && (
          <div className="pagination">
            <button
              className="btn"
              disabled={contributions.page <= 1}
              onClick={() => contributions.loadPage(contributions.page - 1)}
              style={{ opacity: contributions.page <= 1 ? 0.3 : 1 }}
            >
              prev
            </button>
            <span className="pagination-label">
              {contributions.page} / {Math.ceil(contributions.total / 30)}
            </span>
            <button
              className="btn"
              disabled={contributions.page >= Math.ceil(contributions.total / 30)}
              onClick={() => contributions.loadPage(contributions.page + 1)}
              style={{
                opacity: contributions.page >= Math.ceil(contributions.total / 30) ? 0.3 : 1,
              }}
            >
              next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
