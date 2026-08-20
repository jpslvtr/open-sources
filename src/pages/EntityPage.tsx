import { useParams, Link } from "react-router-dom";
import { useEntity, useContributions } from "../hooks/useEntity";
import { SectionHeader } from "../components/SectionHeader";
import { StatTiles, entityStatsToTiles } from "../components/StatTiles";
import { ContributionTable } from "../components/ContributionTable";
import { DataFreshness } from "../components/DataFreshness";
import { Skeleton, SkeletonRows } from "../components/Skeleton";
import { formatCurrency } from "../utils/format";
import { useState } from "react";

const PARTY_LABELS: Record<string, string> = {
  DEM: "Democrat",
  REP: "Republican",
  IND: "Independent",
  LIB: "Libertarian",
  GRN: "Green",
};

export function EntityPage() {
  const { id } = useParams<{ id: string }>();
  const entityId = id ? decodeURIComponent(id) : undefined;
  const { entity, stats, dataAsOf, loading, error } = useEntity(entityId);
  const [direction, setDirection] = useState<"received" | "given">("received");
  const contributions = useContributions(entityId, direction);

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
        <Link to="/" className="btn" style={{ marginBottom: "1.5rem", display: "inline-block" }}>
          back
        </Link>
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
      <Link
        to="/"
        className="btn fade-in"
        style={{ marginBottom: "1.5rem", display: "inline-block" }}
      >
        back
      </Link>

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
          <div style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.5rem",
            marginTop: "1rem",
          }}>
            <button
              className="btn"
              disabled={contributions.page <= 1}
              onClick={() => contributions.loadPage(contributions.page - 1)}
              style={{ opacity: contributions.page <= 1 ? 0.3 : 1 }}
            >
              prev
            </button>
            <span style={{ fontSize: "11px", color: "var(--fg4)", alignSelf: "center" }}>
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

      <div className="fade-in" style={{ animationDelay: "245ms" }}>
        <Link
          to={`/entity/${encodeURIComponent(entity.id)}/graph`}
          className="btn"
          style={{ display: "inline-block" }}
        >
          view money network
        </Link>
      </div>
    </div>
  );
}
