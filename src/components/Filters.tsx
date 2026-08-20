import type { SearchFilters } from "../types/entities";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY","DC","PR","GU","VI","AS",
];

interface FiltersProps {
  filters: SearchFilters;
  onChange: (filters: SearchFilters) => void;
}

type FilterButton = { value: string; label: string };

function FilterGroup({
  options,
  selected,
  onSelect,
}: {
  options: FilterButton[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <>
      {options.map((opt) => (
        <button
          key={opt.value}
          className={`btn${selected === opt.value ? " active" : ""}`}
          onClick={() => onSelect(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </>
  );
}

export function Filters({ filters, onChange }: FiltersProps) {
  const update = (key: keyof SearchFilters, value: string) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div style={{ marginBottom: "1rem" }}>
      <div className="filter-row">
        <FilterGroup
          options={[
            { value: "all", label: "all" },
            { value: "candidate", label: "candidates" },
            { value: "committee", label: "committees" },
          ]}
          selected={filters.type}
          onSelect={(v) => update("type", v)}
        />
      </div>
      <div className="filter-row">
        <FilterGroup
          options={[
            { value: "all", label: "any party" },
            { value: "DEM", label: "D" },
            { value: "REP", label: "R" },
            { value: "IND", label: "I" },
          ]}
          selected={filters.party as string}
          onSelect={(v) => update("party", v)}
        />
        <select
          value={filters.state as string}
          onChange={(e) => update("state", e.target.value)}
          style={{
            border: "1px solid var(--border)",
            background: "var(--bg)",
            color: "var(--fg3)",
            padding: "0.25rem 0.5rem",
            fontSize: "11px",
          }}
        >
          <option value="all">any state</option>
          {US_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
