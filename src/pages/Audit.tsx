import { Fragment, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { ChevronDown, ChevronRight, Download, CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { fetchAnalyticsInvoices, watchInvoiceChanges, type AnalyticsInvoice } from "@/lib/analyticsData";

type Entry = {
  id: string; ts: string; action: "Reconciliation" | "Upload" | "Flag" | "Accept";
  entity: string; user: string; details: string; status: "Success" | "Pending" | "Failed";
  before?: string; after?: string;
};

const seed: Entry[] = Array.from({ length: 20 }).map((_, i) => {
  const actions: Entry["action"][] = ["Reconciliation", "Upload", "Flag", "Accept"];
  const users = ["admin@gstnexus.io", "auditor@gstnexus.io", "ops@gstnexus.io"];
  const statuses: Entry["status"][] = ["Success", "Success", "Success", "Pending", "Failed"];
  const a = actions[i % actions.length];
  const d = new Date(Date.now() - i * 36e5 * 6);
  return {
    id: `A-${1000 + i}`,
    ts: d.toISOString(),
    action: a,
    entity: a === "Upload" ? `gstr2b_apr_${i}.csv` : `INV-20${30 + i}`,
    user: users[i % users.length],
    details: a === "Reconciliation" ? "Matched 42 / 50 invoices" :
             a === "Upload" ? "Imported GSTR-2B file" :
             a === "Flag" ? "Flagged for tax mismatch" : "Accepted matched invoice",
    status: statuses[i % statuses.length],
    before: a === "Flag" || a === "Accept" ? `status: Pending` : undefined,
    after: a === "Flag" ? `status: Flagged` : a === "Accept" ? `status: Accepted` : undefined,
  };
});

const buildAuditEntries = (rows: AnalyticsInvoice[], usingSample: boolean): Entry[] => {
  const uploadEntry: Entry = {
    id: usingSample ? "A-SAMPLE-UPLOAD" : "A-LIVE-UPLOAD",
    ts: rows[0]?.created_at ?? new Date().toISOString(),
    action: "Upload",
    entity: usingSample ? "sample_gstr_data.csv" : "uploaded_invoice_data",
    user: usingSample ? "sample@gstnexus.io" : "current-user",
    details: usingSample ? "Loaded sample analytics data" : `Imported ${rows.length} invoice records`,
    status: "Success",
  };

  return [uploadEntry, ...rows.slice(0, 30).map<Entry>((row, index) => {
    const action: Entry["action"] = row.status === "Matched" ? "Accept" : index % 2 ? "Flag" : "Reconciliation";
    return {
      id: `A-${row.id}`,
      ts: row.created_at ?? new Date(Date.now() - index * 36e5).toISOString(),
      action,
      entity: row.invoice_no,
      user: usingSample ? ["admin@gstnexus.io", "auditor@gstnexus.io", "ops@gstnexus.io"][index % 3] : "current-user",
      details: row.status === "Matched" ? "Accepted matched invoice" : `Flagged for ${row.mismatch_type || "tax mismatch"}`,
      status: "Success",
      before: row.status === "Matched" ? "status: Pending" : "status: Pending",
      after: row.status === "Matched" ? "status: Accepted" : "status: Flagged",
    };
  })];
};

export default function Audit() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [type, setType] = useState("All");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState<Date | undefined>();
  const [to, setTo] = useState<Date | undefined>();
  const [entries, setEntries] = useState<Entry[]>(seed);
  const [usingSample, setUsingSample] = useState(true);

  const load = async () => {
    try {
      const { rows, usingSample } = await fetchAnalyticsInvoices();
      setEntries(buildAuditEntries(rows, usingSample));
      setUsingSample(usingSample);
    } catch (error: any) {
      toast.error(error.message || "Unable to load audit analytics");
    }
  };

  useEffect(() => {
    load();
    return watchInvoiceChanges(load);
  }, []);

  const filtered = useMemo(() => entries.filter((e) => {
    if (type !== "All" && e.action !== type) return false;
    if (q && !e.entity.toLowerCase().includes(q.toLowerCase())) return false;
    const d = new Date(e.ts);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }), [entries, type, q, from, to]);

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(14); doc.text("GSTNexus — Audit Report", 14, 15);
    doc.setFontSize(9); doc.text(`Generated ${new Date().toLocaleString()}`, 14, 22);
    autoTable(doc, {
      startY: 28,
      head: [["Timestamp", "Action", "Entity", "User", "Details", "Status"]],
      body: filtered.map((e) => [new Date(e.ts).toLocaleString(), e.action, e.entity, e.user, e.details, e.status]),
      styles: { fontSize: 8 },
      headStyles: { fillColor: [6, 182, 212] },
    });
    doc.save(`audit-${Date.now()}.pdf`);
    toast.success("Audit report downloaded");
  };

  const statusColor = (s: Entry["status"]) =>
    s === "Success" ? "bg-success/15 text-success border-success/30" :
    s === "Pending" ? "bg-warning/15 text-warning border-warning/30" :
    "bg-danger/15 text-danger border-danger/30";

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Audit Trails</h1>
          <p className="text-sm text-muted-foreground">Complete history of all reconciliation actions.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-xs px-2.5 py-1 rounded-full border ${usingSample ? "border-warning/40 text-warning bg-warning/10" : "border-success/40 text-success bg-success/10"}`}>
            {usingSample ? "Showing sample data" : "Live data"}
          </span>
          <Button variant="outline" onClick={exportPdf}><Download className="h-4 w-4 mr-2" /> Export Audit Report</Button>
        </div>
      </div>

      <div className="glass rounded-xl p-4 flex flex-wrap items-center gap-3">
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("justify-start", !from && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3 mr-2" />{from ? format(from, "PP") : "From"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={from} onSelect={setFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className={cn("justify-start", !to && "text-muted-foreground")}>
              <CalendarIcon className="h-3 w-3 mr-2" />{to ? format(to, "PP") : "To"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={to} onSelect={setTo} initialFocus className={cn("p-3 pointer-events-auto")} />
          </PopoverContent>
        </Popover>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="All">All actions</SelectItem>
            <SelectItem value="Reconciliation">Reconciliation</SelectItem>
            <SelectItem value="Upload">Upload</SelectItem>
            <SelectItem value="Flag">Flag</SelectItem>
            <SelectItem value="Accept">Accept</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search invoice…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-xs h-9" />
        {(from || to || q || type !== "All") && (
          <Button size="sm" variant="ghost" onClick={() => { setFrom(undefined); setTo(undefined); setQ(""); setType("All"); }}>Clear</Button>
        )}
      </div>

      <div className="glass rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 text-muted-foreground">
              <tr>
                <th className="w-8"></th>
                {["Timestamp", "Action", "Entity", "Performed By", "Details", "Status"].map(h =>
                  <th key={h} className="text-left px-4 py-3 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <Fragment key={e.id}>
                  <tr className="border-t border-border hover:bg-secondary/20 cursor-pointer"
                    onClick={() => setOpenId(openId === e.id ? null : e.id)}>
                    <td className="px-2">{openId === e.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(e.ts).toLocaleString()}</td>
                    <td className="px-4 py-3">{e.action}</td>
                    <td className="px-4 py-3 font-mono text-xs">{e.entity}</td>
                    <td className="px-4 py-3 text-xs">{e.user}</td>
                    <td className="px-4 py-3 text-muted-foreground">{e.details}</td>
                    <td className="px-4 py-3"><span className={`text-xs px-2 py-0.5 rounded border ${statusColor(e.status)}`}>{e.status}</span></td>
                  </tr>
                  {openId === e.id && (
                    <tr className="border-t border-border bg-background/50">
                      <td></td>
                      <td colSpan={6} className="px-4 py-3 text-xs">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <div className="text-muted-foreground mb-1">Before</div>
                            <code className="block bg-secondary/40 p-2 rounded">{e.before ?? "—"}</code>
                          </div>
                          <div>
                            <div className="text-muted-foreground mb-1">After</div>
                            <code className="block bg-secondary/40 p-2 rounded">{e.after ?? "—"}</code>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">No audit entries match.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}