import { useRef, useEffect } from "react";
import * as d3 from "d3";
import type { GraphResponse, GraphNode } from "../types/api";
import { formatCurrency } from "../utils/format";

interface Props {
  data: GraphResponse;
  onNodeClick: (nodeId: string) => void;
  width: number;
  height: number;
}

interface SimNode extends GraphNode {
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
}

interface SimLink {
  source: string | SimNode;
  target: string | SimNode;
  amount: number;
  count: number;
}

function nodeRadius(node: SimNode, maxFlow: number): number {
  if (node.depth === 0) return 14;
  return Math.max(4, Math.sqrt(node.totalFlow / Math.max(maxFlow, 1)) * 12);
}

export function NetworkGraph({ data, onNodeClick, width, height }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const onClickRef = useRef(onNodeClick);
  onClickRef.current = onNodeClick;

  useEffect(() => {
    const svgEl = svgRef.current;
    const tipEl = tooltipRef.current;
    if (!svgEl || !tipEl || !data.nodes.length) return;

    const svg = d3.select(svgEl);
    const tip = d3.select(tipEl);
    svg.selectAll("*").remove();
    svg.attr("width", width).attr("height", height);

    const maxFlow = Math.max(...data.nodes.map((n) => n.totalFlow));
    const maxAmount = Math.max(...data.edges.map((e) => e.amount), 1);

    const simNodes: SimNode[] = data.nodes.map((n, i) => {
      const angle = (2 * Math.PI * i) / data.nodes.length;
      const r = n.depth === 0 ? 0 : 50 + n.depth * 40;
      return {
        ...n,
        x: width / 2 + Math.cos(angle) * r,
        y: height / 2 + Math.sin(angle) * r,
      };
    });
    const simLinks: SimLink[] = data.edges.map((e) => ({
      source: e.source, target: e.target, amount: e.amount, count: e.count,
    }));

    // Arrow marker
    svg.append("defs").append("marker")
      .attr("id", "arr")
      .attr("viewBox", "0 -3 6 6")
      .attr("refX", 6).attr("refY", 0)
      .attr("markerWidth", 6).attr("markerHeight", 6)
      .attr("markerUnits", "userSpaceOnUse")
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-3L6,0L0,3")
      .attr("fill", "var(--fg4)");

    const g = svg.append("g");

    // Edges
    const link = g.append("g").selectAll("line").data(simLinks).join("line")
      .attr("stroke", "var(--fg4)")
      .attr("stroke-width", (d) => 0.5 + (d.amount / maxAmount) * 2.5)
      .attr("stroke-opacity", 0.5)
      .attr("marker-end", "url(#arr)");

    // Nodes
    const node = g.append("g").selectAll("circle").data(simNodes).join("circle")
      .attr("r", (d) => nodeRadius(d, maxFlow))
      .attr("fill", (d) => {
        if (d.depth === 0) return "var(--fg)";
        if (d.depth === 1) return "var(--fg3)";
        return "var(--fg4)";
      })
      .attr("stroke", "var(--bg)")
      .attr("stroke-width", 1)
      .attr("cursor", "pointer");

    // Labels (depth 0 and 1 only; depth 2 shown on hover via tooltip)
    const label = g.append("g").selectAll("text").data(simNodes).join("text")
      .text((d) => {
        if (d.depth >= 2) return "";
        const max = d.depth === 0 ? 28 : 16;
        return d.name.length > max ? d.name.slice(0, max - 1) + "…" : d.name;
      })
      .attr("font-size", (d) => d.depth === 0 ? "11px" : "9px")
      .attr("fill", "var(--fg2)")
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none")
      .attr("font-family", "inherit");

    // Hover
    node
      .on("mouseenter", (event: MouseEvent, d: SimNode) => {
        d3.select(event.currentTarget as SVGCircleElement)
          .attr("stroke", "var(--fg)").attr("stroke-width", 2);
        tip.style("display", "block")
          .style("left", `${event.clientX + 10}px`)
          .style("top", `${event.clientY - 10}px`)
          .text(`${d.name} - ${d.type} - ${formatCurrency(d.totalFlow)}`);
      })
      .on("mousemove", (event: MouseEvent) => {
        tip.style("left", `${event.clientX + 10}px`)
          .style("top", `${event.clientY - 10}px`);
      })
      .on("mouseleave", (event: MouseEvent) => {
        d3.select(event.currentTarget as SVGCircleElement)
          .attr("stroke", "var(--bg)").attr("stroke-width", 1);
        tip.style("display", "none");
      })
    // Force simulation
    const compact = width < 500;
    const sim = d3.forceSimulation<SimNode>(simNodes)
      .force("link", d3.forceLink<SimNode, SimLink>(simLinks)
        .id((d) => d.id)
        .distance((d) => {
          const sd = (d.source as SimNode).depth ?? 0;
          const td = (d.target as SimNode).depth ?? 0;
          return Math.min(sd, td) === 0
            ? (compact ? 80 : 120)
            : (compact ? 50 : 80);
        }))
      .force("charge", d3.forceManyBody<SimNode>()
        .strength((d) => d.depth === 0
          ? (compact ? -300 : -500)
          : (compact ? -80 : -150)))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collide", d3.forceCollide<SimNode>((d) => nodeRadius(d, maxFlow) + 6));

    sim.on("tick", () => {
      link
        .attr("x1", (d) => (d.source as SimNode).x ?? 0)
        .attr("y1", (d) => (d.source as SimNode).y ?? 0)
        .attr("x2", (d) => {
          const s = d.source as SimNode, t = d.target as SimNode;
          const r = nodeRadius(t, maxFlow) + 3;
          const dx = (t.x ?? 0) - (s.x ?? 0);
          const dy = (t.y ?? 0) - (s.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist > 0 ? (t.x ?? 0) - (dx / dist) * r : (t.x ?? 0);
        })
        .attr("y2", (d) => {
          const s = d.source as SimNode, t = d.target as SimNode;
          const r = nodeRadius(t, maxFlow) + 3;
          const dx = (t.x ?? 0) - (s.x ?? 0);
          const dy = (t.y ?? 0) - (s.y ?? 0);
          const dist = Math.sqrt(dx * dx + dy * dy);
          return dist > 0 ? (t.y ?? 0) - (dy / dist) * r : (t.y ?? 0);
        });

      node
        .attr("cx", (d) => d.x ?? 0)
        .attr("cy", (d) => d.y ?? 0);

      label
        .attr("x", (d) => d.x ?? 0)
        .attr("y", (d) => (d.y ?? 0) + nodeRadius(d, maxFlow) + 12);
    });

    // Drag
    const drag = d3.drag<SVGCircleElement, SimNode>()
      .on("start", (event, d) => {
        if (!event.active) sim.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
        tip.style("display", "none");
      })
      .on("drag", (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on("end", (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      });

    (node as d3.Selection<SVGCircleElement, SimNode, SVGGElement, unknown>).call(drag);

    // Click-to-navigate via native pointerdown/pointerup tracking
    const pointerStarts = new Map<number, { x: number; y: number }>();
    node.each(function (_d) {
      const el = this as unknown as SVGCircleElement;
      const d = _d;
      el.addEventListener("pointerdown", (e: PointerEvent) => {
        pointerStarts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      });
      el.addEventListener("pointerup", (e: PointerEvent) => {
        const start = pointerStarts.get(e.pointerId);
        pointerStarts.delete(e.pointerId);
        if (!start) return;
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (dx * dx + dy * dy < 16) {
          onClickRef.current(d.id);
        }
      });
    });

    // Zoom
    svg.call(
      d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent([0.3, 4])
        .on("zoom", (event) => {
          g.attr("transform", event.transform.toString());
        }),
    );

    return () => { sim.stop(); };
  }, [data, width, height]);

  return (
    <div className="graph-wrap">
      <svg ref={svgRef} />
      <div ref={tooltipRef} className="tooltip" style={{ display: "none" }} />
    </div>
  );
}
