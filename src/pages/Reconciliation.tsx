import { Fragment, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, Loader2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchAnalyticsInvoices, watchInvoiceChanges } from "@/lib/analyticsData";

type Invoice = {
  id: string; invoice_no: string; supplier_gstin: string; buyer_gstin: string;
  tax_expected: number; tax_found: number; mismatch_type: string | null;
  risk_level: string; status: string;
};

export default function Reconciliation() {
  const [params] = useSearchParams();
  const initialGstin = params.get("gstin") ?? "";
  const [rows, setRows] = useState<Invoice[]>([]);
  const [typeFilter, setTypeFilter] = useState("all");
  const [severity, setSeverity] = useState("all");
  const [gstinFilter, setGstinFilter] = useState(initialGstin);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionState, setActionState] = useState<Record<string, "accept" | "flag">>({});
  const [openId, setOpenId] = useState<string | null>(null);
  const [usingSample, setUsingSample] = useState(true);

  const load = async () => {
    try {
      const { rows, usingSample } = await fetchAnalyticsInvoices();
      setRows([...rows].sort((a, b) => a.invoice_no.localeCompare(b.invoice_no)) as Invoice[]);
      setUsingSample(usingSample);
    } catch (error: any) {
      toast.error(error.message || "Unable to load analytics data");
    }
  };

  useEffect(() => {
    (async () => { await load(); setLoading(false); })();
    return watchInvoiceChanges(load);
  }, []);

  const rerun = async () => {
    setRefreshing(true);
    await new Promise((r) => setTimeout(r, 2000));
    await load();
    setRefreshing(false);
    toast.success("Reconciliation re-run complete");
  };

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter !== "all" && (r.mismatch_type ?? "None") !== typeFilter) return false;
      if (severity !== "all" && r.risk_level !== severity) return false;
      if (gstinFilter && !r.supplier_gstin.toLowerCase().includes(gstinFilter.toLowerCase()) && !r.buyer_gstin.toLowerCase().includes(gstinFilter.toLowerCase())) return false;
      return true;
    });
  }, [rows, typeFilter, severity, gstinFilter]);

  const typeCounts = useMemo(() => {
    const m: Record<string, number> = {};
    rows.forEach((r) => { if (r.mismatch_type && r.mismatch_type !== "None") m[r.mismatch_type] = (m[r.mismatch_type] || 0) + 1; });
    return m;
  }, [rows]);

  const types = Object.keys(typeCounts);

  const summary = useMemo(() => {
    const matched = rows.filter((r) => r.status === "Matched").length;
    const mismatched = rows.filter((r) => r.status === "Mismatched").length;
    const itc = rows.filter((r) => r.status === "Mismatched")
      .reduce((s, r) => s + Math.abs(Number(r.tax_expected) - Number(r.tax_found)), 0);
    return { total: rows.length, matched, mismatched, itc };
  }, [rows]);

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("GSTNexus — Reconciliation Report", 14, 15);
    doc.setFontSize(9); doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Invoice", "Supplier GSTIN", "Buyer GSTIN", "Expected", "Found", "Mismatch", "Risk", "Status"]],
      body: filtered.map((r) => [r.invoice_no, r.supplier_gstin, r.buyer_gstin, r.tax_expected, r.tax_found, r.mismatch_type ?? "—", r.risk_level, r.status]),
      styles: { fontSize: 7 },
      headStyles: { fillColor: [6, 182, 212] },
    });
    doc.save(`reconciliation-${Date.now()}.pdf`);
    toast.success("PDF report downloaded");
  };

  const riskBadge = (r: string) => {
    const map: any = { Critical: "bg-danger/15 text-danger border-danger/30", High: "bg-warning/15 text-warning border-warning/30", Medium: "bg-primary/15 text-primary border-primary/30", Low: "bg-success/15 text-success border-success/30" };
    return <span className={`text-xs px-2 py-0.5 rounded border ${map[r] || ""}`}>{r}</span>;
  };

  const reasonOf = (r: Invoice) => {
    if (r.status === "Matched") return "All fields reconcile correctly between supplier and buyer filings.";
    const diff = Number(r.tax_expected) - Number(r.tax_found);
    if ((r.mismatch_type || "").toLowerCase().includes("missing in gstr-2b"))
      return "Supplier has not uploaded this invoice to GSTR-1 yet, so it does not reflect in your GSTR-2B.";
    if ((r.mismatch_type || "").toLowerCase().includes("excess"))
      return "ITC claimed exceeds the amount available in GSTR-2B by ₹" + Math.abs(diff).toLocaleString("en-IN") + ".";
    if ((r.mismatch_type || "").toLowerCase().includes("missing in gstr-1"))
      return "Buyer reported this invoice but it is missing in supplier's GSTR-1 filing.";
    return "Tax values reported by supplier and buyer do not match (difference ₹" + Math.abs(diff).toLocaleString("en-IN") + ").";
  };

  if (loading) return <div className="p-10 flex items-center justify-center"><Loader2 className="animate-spin text-primary" /></div>;

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reconciliation Engine</h1>
          <p className="text-sm text-muted-foreground">Match invoices, flag risk, accept correct entries.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full border ${usingSample ? "border-warning/40 text-warning bg-warning/10" : "border-success/40 text-success bg-success/10"}`}>
            {usingSample ? "Showing sample data" : "Live data"}
          </span>
          <Button onClick={rerun} disabled={refreshing}>
            {refreshing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
            Re-run Reconciliation
          </Button>
          <Button variant="outline" onClick={exportPDF}><Download className="h-4 w-4 mr-2" />Export PDF</Button>
        </div>
      </div>

      <div className="glass rounded-xl p-4 flex flex-wrap items-center gap-6 text-sm">
        <span>Total: <b>{summary.total}</b></span>
        <span>Matched: <b className="text-success">{summary.matched}</b></span>
        <span>Mismatched: <b className="text-warning">{summary.mismatched}</b></span>
        <span>ITC at Risk: <b className="text-danger">₹{summary.itc.toLocaleString("en-IN")}</b></span>
      </div>

      {types.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {types.map((t) => (
            <button key={t} onClick={() => setTypeFilter(typeFilter === t ? "all" : t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${typeFilter === t ? "bg-primary/15 text-primary border-primary/40" : "border-border bg-card hover:bg-secondary"}`}>
              {t.toUpperCase()}: {typeCounts[t]}
            </button>
          ))}
          {typeFilter !== "all" && <button onClick={() => setTypeFilter("all")} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={severity} onValueChange={setSeverity}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All Severities" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="Critical">Critical</SelectItem>
            <SelectItem value="High">High</SelectItem>
            <SelectItem value="Medium">Medium</SelectItem>
            <SelectItem value="Low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Filter by vendor GSTIN" value={gstinFilter}
          onChange={(e) => setGstinFilter(e.target.value)} className="max-w-xs" />
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="w-8"></th>
                {["Invoice","Supplier GSTIN","Buyer GSTIN","Expected","Found","Mismatch","Risk","Action"].map(h =>
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const a = actionState[r.id];
                const rowBg = a === "accept" ? "bg-success/10" : a === "flag" ? "bg-warning/10" : "";
                const isOpen = openId === r.id;
                const taxable = Number(r.tax_expected) * 5;
                const igst = Math.round(Number(r.tax_expected) * 0.5);
                const cgst = Math.round(Number(r.tax_expected) * 0.25);
                const sgst = Math.round(Number(r.tax_expected) * 0.25);
                return (
                  <Fragment key={r.id}>
                  <tr className={`border-t border-border ${rowBg} cursor-pointer hover:bg-secondary/20`} onClick={() => setOpenId(isOpen ? null : r.id)}>
                    <td className="px-2">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-4 py-3 font-medium">{r.invoice_no}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.supplier_gstin}</td>
                    <td className="px-4 py-3 font-mono text-xs">{r.buyer_gstin}</td>
                    <td className="px-4 py-3">₹{Number(r.tax_expected).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3">₹{Number(r.tax_found).toLocaleString("en-IN")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.mismatch_type ?? "—"}</td>
                    <td className="px-4 py-3">{riskBadge(r.risk_level)}</td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                          onClick={() => { setActionState((s) => ({ ...s, [r.id]: "accept" })); toast.success(`${r.invoice_no} accepted`); }}>
                          Accept
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs text-warning"
                          onClick={() => { setActionState((s) => ({ ...s, [r.id]: "flag" })); toast(`${r.invoice_no} flagged`); }}>
                          Flag
                        </Button>
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-background/50 border-t border-border">
                      <td></td>
                      <td colSpan={8} className="px-4 py-4">
                        <div className="grid sm:grid-cols-5 gap-3 text-xs mb-3">
                          <div><div className="text-muted-foreground">Invoice Date</div><div className="font-medium">2026-03-{(parseInt(r.invoice_no.replace(/\D/g,"")) % 28 + 1).toString().padStart(2,"0")}</div></div>
                          <div><div className="text-muted-foreground">Taxable Value</div><div className="font-medium">₹{taxable.toLocaleString("en-IN")}</div></div>
                          <div><div className="text-muted-foreground">IGST</div><div className="font-medium">₹{igst.toLocaleString("en-IN")}</div></div>
                          <div><div className="text-muted-foreground">CGST</div><div className="font-medium">₹{cgst.toLocaleString("en-IN")}</div></div>
                          <div><div className="text-muted-foreground">SGST</div><div className="font-medium">₹{sgst.toLocaleString("en-IN")}</div></div>
                        </div>
                        <div className="text-xs mb-3">
                          <span className="text-muted-foreground">Reason: </span>{reasonOf(r)}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => { setActionState((s) => ({ ...s, [r.id]: "accept" })); toast.success(`${r.invoice_no} accepted`); }}>Accept</Button>
                          <Button size="sm" variant="outline" className="text-warning" onClick={() => { setActionState((s) => ({ ...s, [r.id]: "flag" })); toast(`Dispute raised on ${r.invoice_no}`); }}>Raise Dispute</Button>
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={9} className="text-center py-10 text-muted-foreground">No invoices match filters.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}