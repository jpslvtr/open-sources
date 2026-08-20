import { useParams, useNavigate, Link } from "react-router-dom";
import { useGraph } from "../hooks/useGraph";
import { NetworkGraph } from "../components/NetworkGraph";
import { SkeletonRows } from "../components/Skeleton";
import { useState, useRef, useEffect, useCallback } from "react";

const DEPTH_OPTIONS = [1, 2, 3, 4];

export function GraphPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const entityId = id ? decodeURIComponent(id) : undefined;
  const [depth, setDepth] = useState(2);
  const { data, loading, error } = useGraph(entityId, depth);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 900, height: 600 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      const vh = window.innerHeight;
      setDims({ width: w, height: Math.max(450, vh - 200) });
    };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    if (nodeId.startsWith("fec:") || nodeId.startsWith("name:")) {
      navigate(`/entity/${encodeURIComponent(nodeId)}`);
    }
  }, [navigate]);

  const centerName = data?.nodes.find((n) => n.depth === 0)?.name ?? "...";

  return (
    <div className="graph-page">
      <nav className="breadcrumb fade-in">
        <Link to="/">search</Link>
        <span className="breadcrumb-sep">/</span>
        <Link to={entityId ? `/entity/${encodeURIComponent(entityId)}` : "/"}>
          {centerName.toLowerCase()}
        </Link>
        <span className="breadcrumb-sep">/</span>
        <span>network</span>
      </nav>

      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: "1rem", flexWrap: "wrap", gap: "0.75rem",
      }}>
        <h1
          className="fade-in"
          style={{
            fontSize: "20px",
            fontWeight: 600,
            letterSpacing: "-0.5px",
            lineHeight: 1.2,
          }}
        >
          money network
        </h1>
        <div className="fade-in" style={{
          animationDelay: "35ms",
          display: "flex", alignItems: "center", gap: "0.75rem",
        }}>
          <span style={{ fontSize: "10px", color: "var(--fg4)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
            depth
          </span>
          <div className="depth-selector">
            {DEPTH_OPTIONS.map((d) => (
              <button
                key={d}
                className={`depth-btn${depth === d ? " active" : ""}`}
                onClick={() => setDepth(d)}
              >
                {d}
              </button>
            ))}
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
              {depth >= 3 ? "expanding deep connections..." : "loading network data..."}
            </div>
          </div>
        ) : data && data.nodes.length > 0 ? (
          <div className="graph-wrap">
            <NetworkGraph
              data={data}
              onNodeClick={handleNodeClick}
              width={dims.width}
              height={dims.height}
            />
          </div>
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
          display: "flex", justifyContent: "space-between",
        }}>
          <span>{data.nodes.length} entities, {data.edges.length} connections</span>
          <span>drag to rearrange, scroll to zoom, click to navigate</span>
        </div>
      )}
    </div>
  );
}
