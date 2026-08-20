import { useState } from "react";
import { NameLink } from "./NameLink";
import { formatCurrencyFull, formatDate, staggerDelay } from "../utils/format";
import type { Contribution } from "../types/entities";

interface ContributionTableProps {
  contributions: Contribution[];
  direction: "received" | "given";
  loading?: boolean;
  baseDelay?: number;
}

type SortKey = "amount" | "date" | "name";
type SortDir = "asc" | "desc";

export function ContributionTable({ contributions, direction, loading, baseDelay = 0 }: ContributionTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = [...contributions].sort((a, b) => {
    const mul = sortDir === "asc" ? 1 : -1;
    if (sortKey === "amount") return mul * (a.amount - b.amount);
    if (sortKey === "date") return mul * (a.date.localeCompare(b.date));
    const nameA = direction === "received" ? a.contributorName : a.recipientName;
    const nameB = direction === "received" ? b.contributorName : b.recipientName;
    return mul * nameA.localeCompare(nameB);
  });

  const sortIndicator = (key: SortKey) => {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ^" : " v";
  };

  return (
    <div className="scroll-x">
      <table className="data-table">
        <thead>
          <tr>
            <th
              className="sortable"
              onClick={() => toggleSort("name")}
              style={{ width: "45%" }}
            >
              {direction === "received" ? "from" : "to"}{sortIndicator("name")}
            </th>
            <th
              className="sortable"
              onClick={() => toggleSort("amount")}
              style={{ width: "25%", textAlign: "right" }}
            >
              amount{sortIndicator("amount")}
            </th>
            <th
              className="sortable"
              onClick={() => toggleSort("date")}
              style={{ width: "30%", textAlign: "right" }}
            >
              date{sortIndicator("date")}
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((c, i) => {
            const name = direction === "received" ? c.contributorName : c.recipientName;
            const linkedId = direction === "received" ? c.contributorId : c.recipientId;
            return (
              <tr
                key={c.id}
                className="fade-in"
                style={{ animationDelay: staggerDelay(i, baseDelay) }}
              >
                <td>
                  <NameLink entityId={linkedId} name={name} />
                  {c.employer && (
                    <div style={{ fontSize: "10px", color: "var(--fg4)", marginTop: "2px" }}>
                      {c.employer}{c.occupation ? ` / ${c.occupation}` : ""}
                    </div>
                  )}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {formatCurrencyFull(c.amount)}
                </td>
                <td style={{ textAlign: "right", fontSize: "12px", color: "var(--fg3)" }}>
                  {formatDate(c.date)}
                </td>
              </tr>
            );
          })}
          {!loading && sorted.length === 0 && (
            <tr>
              <td colSpan={3} style={{ textAlign: "center", color: "var(--fg4)", padding: "2rem 0" }}>
                no contributions found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
