import { formatCurrency } from "../utils/format";
import { staggerDelay } from "../utils/format";

interface Stat {
  value: string;
  label: string;
  sub?: string;
}

interface StatTilesProps {
  stats: Stat[];
  baseDelay?: number;
}

export function StatTiles({ stats, baseDelay = 0 }: StatTilesProps) {
  return (
    <div className="stat-tiles">
      {stats.map((s, i) => (
        <div
          key={s.label}
          className="stat-tile fade-in"
          style={{ animationDelay: staggerDelay(i, baseDelay) }}
        >
          <div className="stat-value">{s.value}</div>
          <div className="stat-label">{s.label}</div>
          {s.sub && <div className="stat-sub">{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function entityStatsToTiles(stats: {
  totalReceived: number;
  totalGiven: number;
  contributionCount: number;
}): Stat[] {
  return [
    { value: formatCurrency(stats.totalReceived), label: "received" },
    { value: formatCurrency(stats.totalGiven), label: "spent" },
    {
      value: stats.contributionCount > 0 ? stats.contributionCount.toLocaleString() : "-",
      label: "contributions",
    },
  ];
}
