interface SectionHeaderProps {
  label: string;
  source?: string;
}

export function SectionHeader({ label, source }: SectionHeaderProps) {
  return (
    <div className="section-header">
      <span className="section-label">{label}</span>
      {source && <span className="section-source">{source}</span>}
    </div>
  );
}
