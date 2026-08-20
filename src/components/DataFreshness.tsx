interface DataFreshnessProps {
  date: string | null;
}

export function DataFreshness({ date }: DataFreshnessProps) {
  if (!date) return null;
  return <span className="freshness">data as of {date}</span>;
}
