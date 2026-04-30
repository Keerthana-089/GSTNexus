import { useCallback, useEffect, useMemo, useState } from "react";
import ReactFlow, {
  Background, Controls, MiniMap, MarkerType,
  applyNodeChanges, applyEdgeChanges,
  type Node, type Edge, type NodeChange, type EdgeChange, type ReactFlowInstance,
} from "reactflow";
import "reactflow/dist/style.css";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, Search, Copy, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { fetchAnalyticsInvoices, getStateFromGstin, getVendorName, watchInvoiceChanges, type AnalyticsInvoice } from "@/lib/analyticsData";

type NodeMeta = {
  id: string; gstin: string; name: string; state: string;
  riskScore: number; connections: number; status: "Active" | "Inactive" | "Defaulter";
  itc: number; type: "taxpayer" | "invoice" | "hub"; circular?: boolean;
  connected: string[];
};

const sampleMeta: Record<string, NodeMeta> = {
  T1: { id: "T1", gstin: "27AABCU9603R1ZM", name: "Mumbai Steel Pvt Ltd", state: "Maharashtra", riskScore: 78, connections: 7, status: "Active", itc: 540000, type: "hub", circular: true, connected: ["T2","T3","T4","I1","I2","T5","T6"] },
  T2: { id: "T2", gstin: "29AAACI1681G1Z0", name: "Bangalore Traders LLP", state: "Karnataka", riskScore: 64, connections: 6, status: "Active", itc: 320000, type: "hub", circular: true, connected: ["T1","T3","T5","I3","I4","T7"] },
  T3: { id: "T3", gstin: "07AAACR4849R1Z3", name: "Delhi Imports Co", state: "Delhi", riskScore: 71, connections: 4, status: "Defaulter", itc: 210000, type: "taxpayer", circular: true, connected: ["T1","T2","I5","T8"] },
  T4: { id: "T4", gstin: "27AAGCT2345A1Z9", name: "Pune Logistics", state: "Maharashtra", riskScore: 22, connections: 2, status: "Active", itc: 84000, type: "taxpayer", connected: ["T1","I1"] },
  T5: { id: "T5", gstin: "29AABCK7766P1Z2", name: "Mysore Exports", state: "Karnataka", riskScore: 35, connections: 3, status: "Active", itc: 142000, type: "taxpayer", connected: ["T1","T2","I3"] },
  T6: { id: "T6", gstin: "27AAFCM4321B1Z1", name: "Nashik Chemicals", state: "Maharashtra", riskScore: 18, connections: 1, status: "Active", itc: 56000, type: "taxpayer", connected: ["T1"] },
  T7: { id: "T7", gstin: "07AABCD9988E1Z6", name: "Delhi Tex Mills", state: "Delhi", riskScore: 45, connections: 2, status: "Inactive", itc: 98000, type: "taxpayer", connected: ["T2","I4"] },
  T8: { id: "T8", gstin: "29AAACO5544Q1Z8", name: "Hubli Hardware", state: "Karnataka", riskScore: 12, connections: 1, status: "Active", itc: 44000, type: "taxpayer", connected: ["T3"] },
  I1: { id: "I1", gstin: "INV-2031", name: "Invoice ₹1,80,000", state: "—", riskScore: 0, connections: 2, status: "Active", itc: 18000, type: "invoice", connected: ["T1","T4"] },
  I2: { id: "I2", gstin: "INV-2032", name: "Invoice ₹90,000",  state: "—", riskScore: 0, connections: 2, status: "Active", itc: 9000,  type: "invoice", connected: ["T1"] },
  I3: { id: "I3", gstin: "INV-2033", name: "Invoice ₹2,70,000", state: "—", riskScore: 0, connections: 2, status: "Active", itc: 27000, type: "invoice", connected: ["T2","T5"] },
  I4: { id: "I4", gstin: "INV-2034", name: "Invoice ₹1,25,000", state: "—", riskScore: 0, connections: 2, status: "Active", itc: 12500, type: "invoice", connected: ["T2","T7"] },
  I5: { id: "I5", gstin: "INV-2035", name: "Invoice ₹4,50,000", state: "—", riskScore: 0, connections: 1, status: "Active", itc: 45000, type: "invoice", connected: ["T3"] },
};

const nodeStyle = (m: NodeMeta) => {
  if (m.type === "invoice") {
    return {
      background: "hsl(var(--card))",
      border: "1.5px solid hsl(var(--success))",
      borderRadius: 10, padding: 10, color: "hsl(var(--foreground))",
      width: 160, fontSize: 11, textAlign: "center" as const,
    };
  }
  const isHub = m.type === "hub";
  return {
    background: "hsl(var(--card))",
    border: `2px solid ${isHub ? "hsl(var(--warning))" : "hsl(var(--primary))"}`,
    borderRadius: 999, padding: 14, width: isHub ? 160 : 140, height: isHub ? 160 : 140,
    color: "hsl(var(--foreground))", fontSize: 11, textAlign: "center" as const,
    boxShadow: isHub ? "0 0 25px hsl(var(--warning) / 0.45)" : "0 0 18px hsl(var(--primary) / 0.25)",
    display: "flex", alignItems: "center", justifyContent: "center",
  };
};

const buildGraph = (rows: AnalyticsInvoice[]) => {
  const vendors = Array.from(new Set(rows.flatMap((r) => [r.supplier_gstin, r.buyer_gstin]))).slice(0, 12);
  const graphMeta: Record<string, NodeMeta> = {};
  vendors.forEach((gstin, index) => {
    const related = rows.filter((r) => r.supplier_gstin === gstin || r.buyer_gstin === gstin);
    const flagged = related.filter((r) => r.status === "Mismatched").length;
    const riskScore = related.length ? Math.min(100, Math.round((flagged / related.length) * 85)) : 0;
    const id = `T${index + 1}`;
    graphMeta[id] = {
      id,
      gstin,
      name: getVendorName(gstin, index),
      state: getStateFromGstin(gstin),
      riskScore,
      connections: 0,
      status: riskScore > 70 ? "Defaulter" : "Active",
      itc: related.reduce((sum, r) => sum + Number(r.tax_expected), 0),
      type: riskScore > 55 ? "hub" : "taxpayer",
      circular: riskScore > 70,
      connected: [],
    };
  });
  const idByGstin = Object.fromEntries(Object.values(graphMeta).map((m) => [m.gstin, m.id]));
  const edges: Edge[] = rows.slice(0, 24).map((r, i) => {
    const source = idByGstin[r.supplier_gstin];
    const target = idByGstin[r.buyer_gstin];
    if (source && target) {
      graphMeta[source].connected.push(target);
      graphMeta[target].connected.push(source);
    }
    const risky = r.status === "Mismatched";
    return {
      id: `e-live-${i}`,
      source: source || "T1",
      target: target || "T2",
      label: risky ? r.mismatch_type || "Mismatch" : undefined,
      animated: risky,
      style: { stroke: risky ? "hsl(var(--danger))" : "hsl(var(--success))", strokeWidth: risky ? 2 : 1.5, strokeDasharray: risky ? "6 4" : undefined },
      markerEnd: { type: MarkerType.ArrowClosed, color: risky ? "hsl(var(--danger))" : "hsl(var(--success))" },
    } as Edge;
  }).filter((e) => e.source !== e.target);
  Object.values(graphMeta).forEach((m) => { m.connected = Array.from(new Set(m.connected)); m.connections = m.connected.length; });
  return { graphMeta, edges: edges.length ? edges : baseEdges };
};

const buildNodes = (graphMeta: Record<string, NodeMeta>): Node[] => {
  const positions: Record<string, [number, number]> = {
    T1: [400, 100], T2: [780, 280], T3: [120, 280],
    T4: [600, 0],   T5: [780, 480], T6: [400, -80],
    T7: [980, 200], T8: [0, 380],
    I1: [560, 80],  I2: [320, -40], I3: [900, 420],
    I4: [900, 120], I5: [60, 460],
  };
  return Object.values(graphMeta).map((m, index) => ({
    id: m.id,
    position: positions[m.id] ? { x: positions[m.id][0], y: positions[m.id][1] } : { x: 420 + Math.cos(index) * 360, y: 220 + Math.sin(index) * 260 },
    data: { label: m.type === "invoice" ? m.name : <div><div className="font-semibold">{m.name}</div><div className="text-[9px] text-muted-foreground mt-1 font-mono">{m.gstin}</div></div> },
    style: nodeStyle(m),
    className: m.circular ? "pulse-red" : "",
  }));
};

const baseEdges: Edge[] = [
  // Circular trade A -> B -> C -> A
  { id: "e-c1", source: "T1", target: "T2", label: "Circular", animated: true, style: { stroke: "hsl(var(--danger))", strokeDasharray: "6 4", strokeWidth: 2 }, labelStyle: { fill: "hsl(var(--danger))", fontWeight: 600 }, labelBgStyle: { fill: "hsl(var(--background))" }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--danger))" } },
  { id: "e-c2", source: "T2", target: "T3", label: "Circular", animated: true, style: { stroke: "hsl(var(--danger))", strokeDasharray: "6 4", strokeWidth: 2 }, labelStyle: { fill: "hsl(var(--danger))", fontWeight: 600 }, labelBgStyle: { fill: "hsl(var(--background))" }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--danger))" } },
  { id: "e-c3", source: "T3", target: "T1", label: "Circular", animated: true, style: { stroke: "hsl(var(--danger))", strokeDasharray: "6 4", strokeWidth: 2 }, labelStyle: { fill: "hsl(var(--danger))", fontWeight: 600 }, labelBgStyle: { fill: "hsl(var(--background))" }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--danger))" } },
  // ITC links (green)
  { id: "e-i1", source: "T1", target: "I1", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  { id: "e-i2", source: "I1", target: "T4", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  { id: "e-i3", source: "T1", target: "I2", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  { id: "e-i4", source: "T2", target: "I3", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  { id: "e-i5", source: "I3", target: "T5", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  { id: "e-i6", source: "T2", target: "I4", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  { id: "e-i7", source: "I4", target: "T7", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  { id: "e-i8", source: "T3", target: "I5", style: { stroke: "hsl(var(--success))", strokeWidth: 1.5 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--success))" } },
  // Standard transactions (gray)
  { id: "e-n1", source: "T1", target: "T4", style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-n2", source: "T1", target: "T5", style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-n3", source: "T1", target: "T6", style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-n4", source: "T2", target: "T5", style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-n5", source: "T2", target: "T7", style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
  { id: "e-n6", source: "T3", target: "T8", style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: "hsl(var(--muted-foreground))" } },
];

export default function Graph() {
  const initialNodes = useMemo(() => buildNodes(sampleMeta), []);
  const [graphMeta, setGraphMeta] = useState<Record<string, NodeMeta>>(sampleMeta);
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(baseEdges);
  const [selected, setSelected] = useState<NodeMeta | null>(null);
  const [search, setSearch] = useState("");
  const [rf, setRf] = useState<ReactFlowInstance | null>(null);
  const [usingSample, setUsingSample] = useState(true);

  const onNodesChange = useCallback((c: NodeChange[]) => setNodes((n) => applyNodeChanges(c, n)), []);
  const onEdgesChange = useCallback((c: EdgeChange[]) => setEdges((e) => applyEdgeChanges(c, e)), []);

  const load = async () => {
    try {
      const { rows, usingSample } = await fetchAnalyticsInvoices();
      const next = usingSample ? { graphMeta: sampleMeta, edges: baseEdges } : buildGraph(rows);
      setGraphMeta(next.graphMeta);
      setNodes(buildNodes(next.graphMeta));
      setEdges(next.edges);
      setUsingSample(usingSample);
      setSelected((current) => current ? next.graphMeta[current.id] ?? null : null);
    } catch (error: any) {
      toast.error(error.message || "Unable to load graph analytics");
    }
  };

  useEffect(() => {
    load();
    return watchInvoiceChanges(load);
  }, []);

  const onSearch = () => {
    const q = search.trim().toLowerCase();
    const currentNodes = buildNodes(graphMeta);
    if (!q) { setNodes(currentNodes); return; }
    const matches = Object.values(graphMeta).filter(m => m.gstin.toLowerCase().includes(q) || m.name.toLowerCase().includes(q));
    if (matches.length === 0) { toast.error("No matching node"); return; }
    setNodes((ns) => ns.map((n) => {
      const isMatch = matches.some(m => m.id === n.id);
      return { ...n, style: { ...n.style, opacity: isMatch ? 1 : 0.25, outline: isMatch ? "3px solid hsl(var(--primary))" : "none" } };
    }));
    if (rf && matches[0]) {
      const node = currentNodes.find(n => n.id === matches[0].id);
      if (node) rf.setCenter(node.position.x + 70, node.position.y + 70, { zoom: 1.4, duration: 600 });
    }
  };

  const circular = Object.values(graphMeta).filter((m) => m.circular);

  return (
    <div className="h-[calc(100vh-3.5rem)] flex flex-col bg-[#0D1117]">
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-border bg-card/40">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by GSTIN or name…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            className="h-9" />
          <Button size="sm" onClick={onSearch}>Search</Button>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" onClick={() => rf?.zoomIn()} title="Zoom in"><ZoomIn className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => rf?.zoomOut()} title="Zoom out"><ZoomOut className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => rf?.fitView({ duration: 500, padding: 0.2 })} title="Fit"><Maximize2 className="h-4 w-4" /></Button>
          <Button size="icon" variant="outline" onClick={() => { setNodes(buildNodes(graphMeta)); setSearch(""); rf?.fitView({ duration: 400, padding: 0.2 }); }} title="Reset"><RotateCcw className="h-4 w-4" /></Button>
          <span className={`text-xs px-2.5 py-1 rounded-full border ${usingSample ? "border-warning/40 text-warning bg-warning/10" : "border-success/40 text-success bg-success/10"}`}>
            {usingSample ? "Sample" : "Live"}
          </span>
        </div>
      </div>

      <div className="px-4 py-2 bg-danger/10 border-b border-danger/30 flex items-center gap-2 text-sm text-danger">
        <AlertTriangle className="h-4 w-4" />
        <span><b>Circular Trade Pattern Detected</b> — {circular.length || 3} high-risk entities involved</span>
      </div>

      <div className="flex-1 flex min-h-0">
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onInit={setRf}
            onNodeClick={(_, n) => setSelected(graphMeta[n.id])}
            onNodeDoubleClick={(_, n) => rf?.setCenter(n.position.x + 70, n.position.y + 70, { zoom: 1.6, duration: 500 })}
            fitView
            minZoom={0.3}
            maxZoom={2.5}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="hsl(var(--border))" gap={24} />
            <Controls className="!bg-card !border-border" />
            <MiniMap nodeColor={(n) => (graphMeta[n.id]?.type === "hub" ? "#F59E0B" : graphMeta[n.id]?.type === "invoice" ? "#10B981" : "#06B6D4")} maskColor="rgba(0,0,0,0.5)" />
          </ReactFlow>
        </div>

        {selected && (
          <aside className="w-[360px] border-l border-border bg-card/80 backdrop-blur-sm p-5 overflow-auto">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="text-xs text-muted-foreground">{selected.type === "hub" ? "HUB TAXPAYER" : selected.type.toUpperCase()}</div>
                <h3 className="font-bold text-lg">{selected.name}</h3>
              </div>
              <Button size="icon" variant="ghost" onClick={() => setSelected(null)}><X className="h-4 w-4" /></Button>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-1">GSTIN</div>
                <div className="flex items-center gap-2">
                  <code className="font-mono text-xs bg-secondary px-2 py-1 rounded">{selected.gstin}</code>
                  <Button size="icon" variant="ghost" className="h-7 w-7"
                    onClick={() => { navigator.clipboard.writeText(selected.gstin); toast.success("GSTIN copied"); }}>
                    <Copy className="h-3 w-3" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-xs text-muted-foreground">State</div><div>{selected.state}</div></div>
                <div><div className="text-xs text-muted-foreground">Connections</div><div>{selected.connections}</div></div>
              </div>

              {selected.type !== "invoice" && (
                <>
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-muted-foreground">Risk Score</span>
                      <span className="text-xs font-semibold">{selected.riskScore}/100</span>
                    </div>
                    <Progress value={selected.riskScore}
                      className={selected.riskScore > 65 ? "[&>div]:bg-danger" : selected.riskScore > 35 ? "[&>div]:bg-warning" : "[&>div]:bg-success"} />
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Filing Status</div>
                    <span className={`text-xs px-2 py-0.5 rounded border ${
                      selected.status === "Active" ? "bg-success/15 text-success border-success/30" :
                      selected.status === "Defaulter" ? "bg-danger/15 text-danger border-danger/30" :
                      "bg-warning/15 text-warning border-warning/30"
                    }`}>{selected.status}</span>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">ITC Claimed</div>
                    <div className="font-semibold">₹{selected.itc.toLocaleString("en-IN")}</div>
                  </div>
                </>
              )}

              <div>
                <div className="text-xs text-muted-foreground mb-1">Connected Entities</div>
                <ScrollArea className="h-32 rounded border border-border">
                  <div className="p-2 space-y-1">
                    {selected.connected.slice(0, 5).map((id) => (
                      <button key={id} onClick={() => setSelected(graphMeta[id])}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-secondary text-xs">
                        <div className="font-medium">{graphMeta[id]?.name}</div>
                        <div className="font-mono text-[10px] text-muted-foreground">{graphMeta[id]?.gstin}</div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              <Button className="w-full" onClick={() => toast(`Profile for ${selected.name}`, { description: selected.gstin })}>
                View Full Profile
              </Button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}