import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileText, AlertTriangle, Network, Scale, Loader2, Download, Users, TrendingUp, IndianRupee, ShieldX } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { fetchAnalyticsInvoices, getVendorName, SAMPLE_INVOICES, watchInvoiceChanges, type AnalyticsInvoice } from "@/lib/analyticsData";

// Mismatch type → color
const MISMATCH_COLORS: Record<string, string> = {
  "Missing in GSTR-2B": "#F59E0B",
  "Excess ITC": "#EF4444",
  "Missing in GSTR-1": "#06B6D4",
  "Tax Mismatch": "#06B6D4",
};
const FALLBACK_COLORS = ["#F59E0B", "#EF4444", "#06B6D4", "#10B981"];
// Severity → color (for donut)
const SEVERITY_COLORS: Record<string, string> = {
  HIGH: "#F59E0B",
  MEDIUM: "#06B6D4",
  CRITICAL: "#EF4444",
  LOW: "#10B981",
};

type VendorSummary = { name: string; gstin: string; risk: number; flagged: number; total: number };

const buildDashboardData = (data: AnalyticsInvoice[]) => {
  const matched = data.filter((d) => d.status === "Matched").length;
  const mismatched = data.filter((d) => d.status === "Mismatched").length;
  const itc = data.filter((d) => d.status === "Mismatched")
    .reduce((s, d) => s + Math.abs(Number(d.tax_expected) - Number(d.tax_found)), 0);
  const map: Record<string, number> = {};
  data.filter((d) => d.mismatch_type && d.mismatch_type !== "None")
    .forEach((d) => { map[d.mismatch_type!] = (map[d.mismatch_type!] || 0) + 1; });
  const uniq = new Set<string>();
  data.forEach((d) => { uniq.add(d.supplier_gstin); uniq.add(d.buyer_gstin); });
  const sevMap: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  data.forEach((d) => {
    const k = (d.risk_level || "Low").toUpperCase();
    if (sevMap[k] !== undefined) sevMap[k] += 1;
  });
  const vmap: Record<string, { total: number; flagged: number }> = {};
  data.forEach((d) => {
    const k = d.supplier_gstin;
    if (!vmap[k]) vmap[k] = { total: 0, flagged: 0 };
    vmap[k].total += 1;
    if (d.status === "Mismatched") vmap[k].flagged += 1;
  });
  const vendors: VendorSummary[] = Object.entries(vmap)
    .map(([gstin, v], i) => ({
      name: getVendorName(gstin, i),
      gstin,
      risk: v.total ? Math.round((v.flagged / v.total) * 100) : 0,
      flagged: v.flagged,
      total: v.total,
    }))
    .sort((a, b) => b.risk - a.risk)
    .slice(0, 6);

  return {
    stats: { total: data.length, matched, mismatched, itc },
    breakdown: Object.entries(map).map(([name, value]) => ({ name, value })),
    taxpayers: uniq.size,
    txnValue: data.reduce((s, d) => s + Number(d.tax_expected), 0),
    highRisk: data.filter((d) => ["High", "Critical"].includes(d.risk_level)).length,
    severity: Object.entries(sevMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })),
    vendors,
  };
};

const SAMPLE_DASHBOARD = buildDashboardData(SAMPLE_INVOICES);

export default function Dashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState(SAMPLE_DASHBOARD.stats);
  const [breakdown, setBreakdown] = useState<{ name: string; value: number }[]>(SAMPLE_DASHBOARD.breakdown);
  const [loading, setLoading] = useState(true);
  const [taxpayers, setTaxpayers] = useState(SAMPLE_DASHBOARD.taxpayers);
  const [txnValue, setTxnValue] = useState(SAMPLE_DASHBOARD.txnValue);
  const [highRisk, setHighRisk] = useState(SAMPLE_DASHBOARD.highRisk);
  const [vendors, setVendors] = useState<VendorSummary[]>(SAMPLE_DASHBOARD.vendors);
  const [severity, setSeverity] = useState<{ name: string; value: number }[]>(SAMPLE_DASHBOARD.severity);
  const [usingDummy, setUsingDummy] = useState(true);

  const load = async () => {
    const { rows, usingSample } = await fetchAnalyticsInvoices();
    const next = buildDashboardData(rows);
    setStats(next.stats);
    setBreakdown(next.breakdown);
    setTaxpayers(next.taxpayers);
    setTxnValue(next.txnValue);
    setHighRisk(next.highRisk);
    setSeverity(next.severity);
    setVendors(next.vendors);
    setUsingDummy(usingSample);
    setLoading(false);
  };

  useEffect(() => {
    load();
    return watchInvoiceChanges(load);
  }, []);

  const formatINR = (n: number) => `₹${n.toLocaleString("en-IN")}`;
  const kpis = [
    { label: "Taxpayers", value: taxpayers, icon: Users },
    { label: "Invoices", value: stats.total, icon: FileText },
    { label: "Txn Value", value: formatINR(txnValue), icon: TrendingUp },
    { label: "Mismatches", value: stats.mismatched, icon: AlertTriangle },
    { label: "ITC at Risk", value: formatINR(stats.itc), icon: IndianRupee },
    { label: "High Risk", value: highRisk, icon: ShieldX },
  ];

  const severityData = severity.length ? severity : [{ name: "LOW", value: 1 }];

  // ITC at Risk by mismatch type (donut)
  const itcByType = breakdown.length
    ? breakdown.map((b) => ({ name: b.name, value: b.value * 50000 }))
    : [{ name: "No data", value: 1 }];

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text("GSTNexus — Dashboard Summary", 14, 16);
    doc.setFontSize(10); doc.text(`Generated ${new Date().toLocaleString()}`, 14, 23);
    autoTable(doc, {
      startY: 30,
      head: [["Metric", "Value"]],
      body: [
        ["Total Invoices", String(stats.total)],
        ["Matched", String(stats.matched)],
        ["Mismatched", String(stats.mismatched)],
        ["ITC at Risk", `₹${stats.itc.toLocaleString("en-IN")}`],
      ],
      headStyles: { fillColor: [6, 182, 212] },
    });
    if (breakdown.length) {
      autoTable(doc, {
        head: [["Mismatch Type", "Count"]],
        body: breakdown.map((b) => [b.name, String(b.value)]),
        headStyles: { fillColor: [245, 158, 11] },
      });
    }
    doc.save(`dashboard-${Date.now()}.pdf`);
    toast.success("Dashboard PDF downloaded");
  };

  if (loading) return <div className="p-10 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">GST Reconciliation Overview</p>
        </div>
        <span
          className={`text-xs px-2.5 py-1 rounded-full border ${
            usingDummy
              ? "border-warning/40 text-warning bg-warning/10"
              : "border-success/40 text-success bg-success/10"
          }`}
        >
          {usingDummy ? "Showing sample data — upload to see your own" : "Live data"}
        </span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="glass rounded-xl p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <k.icon className="h-3.5 w-3.5" />
              <span className="text-xs">{k.label}</span>
            </div>
            <div className="text-xl font-bold mt-2 truncate">{k.value}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button onClick={() => nav("/reconciliation")}><Scale className="h-4 w-4 mr-2" />Run Reconciliation</Button>
        <Button variant="outline" onClick={exportPdf}><Download className="h-4 w-4 mr-2" />Export PDF</Button>
        <Button variant="outline" onClick={() => nav("/graph")}><Network className="h-4 w-4 mr-2" />View Graph</Button>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-5">
          <h3 className="font-semibold mb-4">Mismatch Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={breakdown.length ? breakdown : [{ name: "No data", value: 0 }]}>
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Bar dataKey="value" radius={[6,6,0,0]}>
                  {(breakdown.length ? breakdown : [{ name: "No data", value: 0 }]).map((b, i) => (
                    <Cell key={i} fill={MISMATCH_COLORS[b.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="font-semibold mb-4">Severity Distribution</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={severityData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {severityData.map((d, i) => <Cell key={i} fill={SEVERITY_COLORS[d.name]} />)}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass rounded-xl p-5">
          <h3 className="font-semibold mb-4">ITC at Risk by Type</h3>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={itcByType} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {itcByType.map((d, i) => (
                    <Cell key={i} fill={MISMATCH_COLORS[d.name] || FALLBACK_COLORS[i % FALLBACK_COLORS.length]} />
                  ))}
                </Pie>
                <Legend wrapperStyle={{ fontSize: 12 }} formatter={(v: string, e: any) => `${v} ${formatINR(e?.payload?.value || 0)}`} />
                <Tooltip formatter={(v: number) => formatINR(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="glass rounded-xl p-5">
        <h3 className="font-semibold mb-4">Top Risky Vendors</h3>
        {vendors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No vendor data yet.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {vendors.map((v) => {
              const color = v.risk >= 60 ? "text-danger" : v.risk >= 40 ? "text-warning" : "text-success";
              return (
                <button
                  key={v.gstin}
                  onClick={() => nav("/vendors")}
                  className="text-left rounded-lg border border-border bg-card/40 p-4 hover:border-primary/50 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{v.name}</div>
                      <div className="text-xs text-muted-foreground font-mono truncate">{v.gstin}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-lg font-bold ${color}`}>{v.risk}%</div>
                      <div className="text-[10px] text-muted-foreground">{v.flagged}/{v.total}</div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}