import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Search, Sparkles, FileText, Loader2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { toast } from "sonner";
import { fetchAnalyticsInvoices, getStateFromGstin, getVendorName, riskTier, watchInvoiceChanges, type AnalyticsInvoice } from "@/lib/analyticsData";

type Vendor = {
  id: string; name: string; gstin: string; state: string;
  riskScore: number; tier: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  itcClaimed: number; itcAvailable: number; circular: boolean;
  filing: { m: string; on: number }[];
};

const VENDORS: Vendor[] = [
  { id: "v1", name: "Mumbai Steel Pvt Ltd", gstin: "27AABCU9603R1ZM", state: "Maharashtra", riskScore: 88, tier: "CRITICAL", itcClaimed: 540000, itcAvailable: 410000, circular: true, filing: [{m:"Oct",on:0},{m:"Nov",on:1},{m:"Dec",on:0},{m:"Jan",on:1},{m:"Feb",on:0},{m:"Mar",on:1}] },
  { id: "v2", name: "Bangalore Traders LLP", gstin: "29AAACI1681G1Z0", state: "Karnataka", riskScore: 74, tier: "HIGH", itcClaimed: 320000, itcAvailable: 280000, circular: true, filing: [{m:"Oct",on:1},{m:"Nov",on:1},{m:"Dec",on:0},{m:"Jan",on:1},{m:"Feb",on:1},{m:"Mar",on:0}] },
  { id: "v3", name: "Delhi Imports Co", gstin: "07AAACR4849R1Z3", state: "Delhi", riskScore: 67, tier: "HIGH", itcClaimed: 210000, itcAvailable: 195000, circular: true, filing: [{m:"Oct",on:1},{m:"Nov",on:0},{m:"Dec",on:1},{m:"Jan",on:1},{m:"Feb",on:0},{m:"Mar",on:1}] },
  { id: "v4", name: "Pune Logistics", gstin: "27AAGCT2345A1Z9", state: "Maharashtra", riskScore: 42, tier: "MEDIUM", itcClaimed: 84000, itcAvailable: 84000, circular: false, filing: [{m:"Oct",on:1},{m:"Nov",on:1},{m:"Dec",on:1},{m:"Jan",on:1},{m:"Feb",on:1},{m:"Mar",on:0}] },
  { id: "v5", name: "Mysore Exports", gstin: "29AABCK7766P1Z2", state: "Karnataka", riskScore: 35, tier: "MEDIUM", itcClaimed: 142000, itcAvailable: 138000, circular: false, filing: [{m:"Oct",on:1},{m:"Nov",on:1},{m:"Dec",on:1},{m:"Jan",on:1},{m:"Feb",on:1},{m:"Mar",on:1}] },
  { id: "v6", name: "Nashik Chemicals", gstin: "27AAFCM4321B1Z1", state: "Maharashtra", riskScore: 22, tier: "LOW", itcClaimed: 56000, itcAvailable: 56000, circular: false, filing: [{m:"Oct",on:1},{m:"Nov",on:1},{m:"Dec",on:1},{m:"Jan",on:1},{m:"Feb",on:1},{m:"Mar",on:1}] },
  { id: "v7", name: "Delhi Tex Mills", gstin: "07AABCD9988E1Z6", state: "Delhi", riskScore: 58, tier: "MEDIUM", itcClaimed: 98000, itcAvailable: 91000, circular: false, filing: [{m:"Oct",on:0},{m:"Nov",on:1},{m:"Dec",on:1},{m:"Jan",on:0},{m:"Feb",on:1},{m:"Mar",on:1}] },
  { id: "v8", name: "Hubli Hardware", gstin: "29AAACO5544Q1Z8", state: "Karnataka", riskScore: 18, tier: "LOW", itcClaimed: 44000, itcAvailable: 44000, circular: false, filing: [{m:"Oct",on:1},{m:"Nov",on:1},{m:"Dec",on:1},{m:"Jan",on:1},{m:"Feb",on:1},{m:"Mar",on:1}] },
];

const TIERS: Vendor["tier"][] = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];

const tierClass = (t: Vendor["tier"]) => ({
  CRITICAL: "bg-danger/15 text-danger border-danger/30",
  HIGH: "bg-warning/15 text-warning border-warning/30",
  MEDIUM: "bg-primary/15 text-primary border-primary/30",
  LOW: "bg-success/15 text-success border-success/30",
}[t]);

const riskBarClass = (s: number) => s > 70 ? "[&>div]:bg-danger" : s > 40 ? "[&>div]:bg-warning" : "[&>div]:bg-success";

const buildVendors = (rows: AnalyticsInvoice[]): Vendor[] => {
  const grouped: Record<string, AnalyticsInvoice[]> = {};
  rows.forEach((row) => {
    if (!grouped[row.supplier_gstin]) grouped[row.supplier_gstin] = [];
    grouped[row.supplier_gstin].push(row);
  });

  return Object.entries(grouped).map(([gstin, invoices], index) => {
    const flagged = invoices.filter((r) => r.status === "Mismatched").length;
    const claimed = invoices.reduce((sum, r) => sum + Number(r.tax_expected), 0);
    const available = invoices.reduce((sum, r) => sum + Number(r.tax_found), 0);
    const exposureRatio = claimed ? Math.min(1, Math.abs(claimed - available) / claimed) : 0;
    const riskScore = Math.min(100, Math.round((flagged / invoices.length) * 72 + exposureRatio * 28));
    const missed = flagged > 0 ? 0 : 1;
    return {
      id: gstin,
      name: getVendorName(gstin, index),
      gstin,
      state: getStateFromGstin(gstin),
      riskScore,
      tier: riskTier(riskScore),
      itcClaimed: claimed,
      itcAvailable: available,
      circular: riskScore >= 70 && flagged >= 2,
      filing: ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"].map((m, i) => ({ m, on: i % 3 === missed ? 0 : 1 })),
    };
  }).sort((a, b) => b.riskScore - a.riskScore);
};

export default function Vendors() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [tier, setTier] = useState<Vendor["tier"] | null>(null);
  const [aiOpen, setAiOpen] = useState<Vendor | null>(null);
  const [aiText, setAiText] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [scOpen, setScOpen] = useState<Vendor | null>(null);
  const [vendors, setVendors] = useState<Vendor[]>(VENDORS);
  const [usingSample, setUsingSample] = useState(true);

  const load = async () => {
    try {
      const { rows, usingSample } = await fetchAnalyticsInvoices();
      setVendors(buildVendors(rows));
      setUsingSample(usingSample);
    } catch (error: any) {
      toast.error(error.message || "Unable to load vendor analytics");
    }
  };

  useEffect(() => {
    load();
    return watchInvoiceChanges(load);
  }, []);

  const filtered = useMemo(() => vendors.filter((v) => {
    if (tier && v.tier !== tier) return false;
    const t = q.trim().toLowerCase();
    if (!t) return true;
    return v.name.toLowerCase().includes(t) || v.gstin.toLowerCase().includes(t);
  }), [q, tier, vendors]);

  const openAi = async (v: Vendor) => {
    setAiOpen(v); setAiText(""); setAiLoading(true);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gst-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({ messages: [{
          role: "user",
          content: `Give a 3-4 line GST risk summary for vendor "${v.name}" (GSTIN ${v.gstin}, state ${v.state}). Risk score ${v.riskScore}/100. ITC claimed ₹${v.itcClaimed}, available ₹${v.itcAvailable}. Circular trading: ${v.circular ? "Yes" : "No"}. Be concise.`
        }] }),
      });
      if (!resp.ok || !resp.body) throw new Error("AI failed");
      const reader = resp.body.getReader(); const dec = new TextDecoder();
      let buf = ""; let acc = ""; let done = false;
      while (!done) {
        const { done: d, value } = await reader.read(); if (d) break;
        buf += dec.decode(value, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, idx); buf = buf.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const delta = p.choices?.[0]?.delta?.content;
            if (delta) { acc += delta; setAiText(acc); }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e: any) { toast.error(e.message || "AI summary failed"); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="p-6 md:p-8 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vendor Risk</h1>
          <p className="text-sm text-muted-foreground">Monitor counterparty GST compliance and risk exposure.</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full border ${usingSample ? "border-warning/40 text-warning bg-warning/10" : "border-success/40 text-success bg-success/10"}`}>
          {usingSample ? "Showing sample data" : "Live data"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search vendor name or GSTIN…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2">
          {TIERS.map((t) => (
            <button key={t} onClick={() => setTier(tier === t ? null : t)}
              className={`text-xs px-3 py-1.5 rounded-full border transition ${tier === t ? tierClass(t) + " ring-2 ring-offset-1 ring-offset-background" : "border-border bg-card hover:bg-secondary"}`}>
              {t}
            </button>
          ))}
          {tier && <button onClick={() => setTier(null)} className="text-xs text-muted-foreground hover:text-foreground">Clear</button>}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((v) => (
          <div key={v.id} className="glass rounded-xl p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{v.name}</div>
                <div className="font-mono text-[11px] text-muted-foreground">{v.gstin}</div>
                <div className="text-xs text-muted-foreground">{v.state}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded border ${tierClass(v.tier)}`}>{v.tier}</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1 text-xs">
                <span className="text-muted-foreground">Risk</span>
                <span className="font-semibold">{v.riskScore}/100</span>
              </div>
              <Progress value={v.riskScore} className={riskBarClass(v.riskScore)} />
            </div>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => openAi(v)}>
                <Sparkles className="h-3 w-3 mr-1.5" /> AI Risk Summary
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setScOpen(v)}>
                <FileText className="h-3 w-3 mr-1.5" /> View Scorecard
              </Button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <div className="col-span-full text-center text-sm text-muted-foreground py-10">No vendors match your filters.</div>}
      </div>

      {/* AI Summary Modal */}
      <Dialog open={!!aiOpen} onOpenChange={(o) => !o && setAiOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI Risk Summary</DialogTitle>
            <DialogDescription>{aiOpen?.name} · {aiOpen?.gstin}</DialogDescription>
          </DialogHeader>
          <div className="text-sm whitespace-pre-wrap min-h-24">
            {aiText || (aiLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : "—")}
          </div>
        </DialogContent>
      </Dialog>

      {/* Scorecard Modal */}
      <Dialog open={!!scOpen} onOpenChange={(o) => !o && setScOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{scOpen?.name} — Scorecard</DialogTitle>
            <DialogDescription className="font-mono text-xs">{scOpen?.gstin}</DialogDescription>
          </DialogHeader>
          {scOpen && (
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-xs text-muted-foreground mb-2">Filing compliance — last 6 months</div>
                <div className="h-32">
                  <ResponsiveContainer>
                    <BarChart data={scOpen.filing}>
                      <XAxis dataKey="m" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis hide domain={[0, 1]} />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} formatter={(v: any) => v ? "Filed" : "Missed"} />
                      <Bar dataKey="on" fill="hsl(var(--success))" radius={[4,4,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Circular trading</div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${scOpen.circular ? "bg-danger/15 text-danger border-danger/30" : "bg-success/15 text-success border-success/30"}`}>
                    {scOpen.circular ? "Yes" : "No"}
                  </span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Risk Tier</div>
                  <span className={`text-xs px-2 py-0.5 rounded border ${tierClass(scOpen.tier)}`}>{scOpen.tier}</span>
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground mb-1">ITC Claimed vs Available</div>
                <div className="flex justify-between text-xs mb-1">
                  <span>Claimed ₹{scOpen.itcClaimed.toLocaleString("en-IN")}</span>
                  <span>Available ₹{scOpen.itcAvailable.toLocaleString("en-IN")}</span>
                </div>
                <Progress value={(scOpen.itcAvailable / scOpen.itcClaimed) * 100} />
              </div>
              <div className="rounded-lg border border-border bg-secondary/30 p-3">
                <div className="text-xs text-muted-foreground mb-1">Verdict</div>
                <div className="text-sm">
                  {scOpen.riskScore > 70
                    ? "High exposure. Recommend immediate review and freezing further ITC claims pending verification."
                    : scOpen.riskScore > 40
                    ? "Moderate risk. Monitor monthly filings and reconcile ITC quarterly."
                    : "Low risk. Continue routine reconciliation."}
                </div>
              </div>
              <Button className="w-full" onClick={() => { setScOpen(null); nav(`/reconciliation?gstin=${scOpen.gstin}`); }}>
                View in Reconciliation
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}