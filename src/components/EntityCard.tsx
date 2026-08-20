import { Link } from "react-router-dom";
import { formatCurrency, staggerDelay } from "../utils/format";
import { DataFreshness } from "./DataFreshness";
import type { SearchResult } from "../types/entities";

interface EntityCardProps {
  result: SearchResult;
  index: number;
  baseDelay?: number;
}

const TYPE_LABELS: Record<string, string> = {
  candidate: "candidate",
  committee: "committee",
  individual: "individual",
  organization: "org",
};

const PARTY_LABELS: Record<string, string> = {
  DEM: "D",
  REP: "R",
  IND: "I",
  LIB: "L",
  GRN: "G",
};

export function EntityCard({ result, index, baseDelay = 0 }: EntityCardProps) {
  const { entity, headline, headlineAmount } = result;
  const partyLabel = entity.party ? PARTY_LABELS[entity.party] ?? entity.party : null;

  return (
    <Link
      to={`/entity/${encodeURIComponent(entity.id)}`}
      className="fade-in"
      style={{
        animationDelay: staggerDelay(index, baseDelay),
        display: "block",
        border: "1px solid var(--border)",
        padding: "0.75rem 1rem",
        marginBottom: "0.5rem",
        transition: "border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--fg3)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline", minWidth: 0 }}>
          <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--fg)" }}>
            {entity.canonicalName}
          </span>
          {partyLabel && (
            <span style={{ fontSize: "10px", color: "var(--fg3)" }}>
              {partyLabel}
            </span>
          )}
          {entity.state && (
            <span style={{ fontSize: "10px", color: "var(--fg4)" }}>
              {entity.state}
            </span>
          )}
        </div>
        {headlineAmount > 0 && (
          <span style={{ fontSize: "13px", fontWeight: 500, color: "var(--fg)", flexShrink: 0 }}>
            {formatCurrency(headlineAmount)}
          </span>
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.25rem" }}>
        <span style={{ fontSize: "11px", color: "var(--fg3)" }}>
          {TYPE_LABELS[entity.type] ?? entity.type}
          {headline ? ` - ${headline}` : ""}
        </span>
        <DataFreshness date={entity.dataAsOf} />
      </div>
    </Link>
  );
}
