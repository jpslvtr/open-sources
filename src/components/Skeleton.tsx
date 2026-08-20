interface SkeletonProps {
  width?: string;
  height?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ width = "100%", height = "1rem", style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width, height, ...style }}
    />
  );
}

export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <Skeleton width="40%" height="0.875rem" />
          <Skeleton width="20%" height="0.875rem" />
          <Skeleton width="15%" height="0.875rem" />
        </div>
      ))}
    </div>
  );
}
