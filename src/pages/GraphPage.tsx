import { useParams, useNavigate, Link } from "react-router-dom";
import { useGraph } from "../hooks/useGraph";
import { NetworkGraph } from "../components/NetworkGraph";
import { SkeletonRows } from "../components/Skeleton";
import { useState, useRef, useEffect, useCallback } from "react";

export function GraphPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const entityId = id ? decodeURIComponent(id) : undefined;
  const [depth, setDepth] = useState(2);
  const { data, loading, error } = useGraph(entityId, depth);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 800, height: 500 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      setDims({ width: w, height: Math.max(400, Math.min(600, w * 0.7)) });
    };
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

  const centerName = data?.nodes.find((n) => n.depth === 0)?.name ?? "...";

  return (
    <div className="graph-page">
      <div style={{
        display: "flex", alignItems: "baseline", gap: "0.75rem", marginBottom: "1rem",
      }}>
        <Link
          to={entityId ? `/entity/${encodeURIComponent(entityId)}` : "/"}
          className="btn"
        >
          back
        </Link>
        <h1
          className="fade-in"
          style={{
            fontSize: "20px",
            fontWeight: 600,
            letterSpacing: "-0.5px",
            lineHeight: 1.2,
          }}
        >
          {centerName}
        </h1>
      </div>

      <div className="fade-in" style={{ animationDelay: "35ms", marginBottom: "0.75rem" }}>
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <span className="section-label">money network</span>
          <div className="filter-row" style={{ marginBottom: 0 }}>
            <button
              className={`btn${depth === 1 ? " active" : ""}`}
              onClick={() => setDepth(1)}
            >
              1-hop
            </button>
            <button
              className={`btn${depth === 2 ? " active" : ""}`}
              onClick={() => setDepth(2)}
            >
              2-hop
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div style={{
          padding: "0.75rem 1rem",
          border: "1px solid var(--border)",
          color: "var(--fg2)",
          fontSize: "12px",
          marginBottom: "1rem",
        }}>
          {error}
        </div>
      )}

      <div ref={containerRef} className="fade-in" style={{ animationDelay: "70ms" }}>
        {loading ? (
          <div style={{ border: "1px solid var(--border)", padding: "2rem" }}>
            <SkeletonRows count={6} />
            <div style={{
              textAlign: "center", color: "var(--fg4)", fontSize: "11px", marginTop: "1rem",
            }}>
              loading network data...
            </div>
          </div>
        ) : data && data.nodes.length > 0 ? (
          <NetworkGraph
            data={data}
            onNodeClick={handleNodeClick}
            width={dims.width}
            height={dims.height}
          />
        ) : !error ? (
          <div style={{
            textAlign: "center", color: "var(--fg4)", fontSize: "13px",
            padding: "3rem 0", border: "1px solid var(--border)",
          }}>
            no network data available
          </div>
        ) : null}
      </div>

      {data && data.nodes.length > 0 && (
        <div className="fade-in" style={{
          animationDelay: "105ms", marginTop: "0.5rem",
          fontSize: "10px", color: "var(--fg4)",
        }}>
          {data.nodes.length} entities - {data.edges.length} connections
          - drag to rearrange, scroll to zoom, click to navigate
        </div>
      )}
    </div>
  );
}
