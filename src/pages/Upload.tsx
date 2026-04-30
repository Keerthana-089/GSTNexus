import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UploadCloud, FileCheck2, X, Trash2, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type Picked = { file: File; kind: "csv" | "json" } | null;

type InvoiceRow = {
  invoice_no: string;
  supplier_gstin: string;
  buyer_gstin: string;
  tax_expected: number;
  tax_found: number;
  mismatch_type: string | null;
  risk_level: string;
  status: string;
};

function pick(obj: Record<string, any>, keys: string[]): any {
  for (const k of keys) {
    const target = k.toLowerCase().replace(/[\s_\-]/g, "");
    const found = Object.keys(obj).find(
      (x) => x.trim().toLowerCase().replace(/[\s_\-]/g, "") === target
    );
    if (found && obj[found] !== undefined && obj[found] !== "") return obj[found];
  }
  return undefined;
}

function num(v: any): number {
  if (v === undefined || v === null || v === "") return 0;
  const n = Number(String(v).replace(/[,₹\s]/g, ""));
  return isNaN(n) ? 0 : n;
}

function normalize(raw: Record<string, any>, idx: number, returnType: string): InvoiceRow {
  // Sum split taxes if present
  const igst = num(pick(raw, ["igst", "igst_amount", "igstamt"]));
  const cgst = num(pick(raw, ["cgst", "cgst_amount", "cgstamt"]));
  const sgst = num(pick(raw, ["sgst", "sgst_amount", "sgstamt", "utgst"]));
  const splitSum = igst + cgst + sgst;

  const expectedRaw = pick(raw, [
    "tax_expected", "expected_tax", "expected", "expected_amount",
    "book_tax", "books_tax", "as_per_books", "tax_as_per_books",
    "gstr1_tax", "gstr_1_tax", "tax_gstr1",
  ]);
  const foundRaw = pick(raw, [
    "tax_found", "found_tax", "actual_tax", "tax_actual",
    "gstr2b_tax", "gstr_2b_tax", "tax_gstr2b", "as_per_2b", "as_per_gstr2b",
    "portal_tax", "tax_portal",
  ]);
  const totalTax = num(pick(raw, ["total_tax", "tax_amount", "taxamount", "tax", "gst_amount", "gst"]));

  let tax_expected = num(expectedRaw);
  let tax_found = num(foundRaw);

  // Fallbacks
  if (!tax_expected && splitSum) tax_expected = splitSum;
  if (!tax_expected && totalTax) tax_expected = totalTax;
  if (!tax_found && splitSum && expectedRaw === undefined) tax_found = splitSum;
  // If only one side known, treat the other as 0 (real gap)
  if (expectedRaw !== undefined && foundRaw === undefined && tax_found === 0) {
    // GSTR-1 / books side present, no 2B match → missing
  }
  if (foundRaw !== undefined && expectedRaw === undefined && tax_expected === 0) {
    // Only found side, no expected → excess
  }

  const diff = Math.abs(tax_expected - tax_found);
  let mismatch_type: string | null = pick(raw, ["mismatch_type", "mismatch"]) || null;
  let status = pick(raw, ["status"]) || (diff > 0.01 ? "Mismatched" : "Matched");
  if (status === "Mismatched" && !mismatch_type) {
    if (tax_found === 0 && tax_expected > 0) mismatch_type = "Missing in GSTR-2B";
    else if (tax_expected === 0 && tax_found > 0) mismatch_type = "Missing in GSTR-1";
    else if (tax_found > tax_expected) mismatch_type = "Excess ITC";
    else mismatch_type = "Tax Mismatch";
  }
  if (status !== "Mismatched") mismatch_type = null;
  let risk_level = pick(raw, ["risk_level", "risk"]) || "Low";
  if (status === "Mismatched") {
    risk_level = diff > 50000 ? "Critical" : diff > 10000 ? "High" : "Medium";
  }
  return {
    invoice_no: String(pick(raw, ["invoice_no", "invoice_number", "inv_no", "invoice", "bill_no", "bill_number", "doc_no", "document_no"]) || `INV-${Date.now()}-${idx}`),
    supplier_gstin: String(pick(raw, ["supplier_gstin", "seller_gstin", "from_gstin", "vendor_gstin", "supplier_gst", "gstin_of_supplier", "supplier"]) || "29AAAAA0000A1Z5"),
    buyer_gstin: String(pick(raw, ["buyer_gstin", "purchaser_gstin", "to_gstin", "recipient_gstin", "customer_gstin", "buyer_gst", "gstin_of_recipient", "buyer"]) || "29BBBBB0000B1Z5"),
    tax_expected,
    tax_found,
    mismatch_type,
    risk_level,
    status,
  };
}

function parseCSV(text: string): Record<string, any>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const split = (l: string) => {
    const out: string[] = []; let cur = ""; let q = false;
    for (const c of l) {
      if (c === '"') q = !q;
      else if (c === "," && !q) { out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map((s) => s.trim().replace(/^"|"$/g, ""));
  };
  const headers = split(lines[0]);
  return lines.slice(1).map((l) => {
    const vals = split(l);
    const o: Record<string, any> = {};
    headers.forEach((h, i) => (o[h] = vals[i] ?? ""));
    return o;
  });
}

function DropZone({ kind, picked, onPick }: { kind: "csv" | "json"; picked: Picked; onPick: (f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false);
        const f = e.dataTransfer.files?.[0]; if (f) onPick(f);
      }}
      className={`glass rounded-xl p-8 cursor-pointer text-center border-dashed transition ${drag ? "border-primary bg-primary/5" : "hover:border-primary/50"}`}
    >
      <input ref={ref} type="file" hidden accept={kind === "csv" ? ".csv,text/csv" : ".json,application/json"}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
      {picked && picked.kind === kind ? (
        <div className="flex flex-col items-center gap-2">
          <FileCheck2 className="h-10 w-10 text-success" />
          <div className="font-medium">{picked.file.name}</div>
          <div className="text-xs text-muted-foreground">{(picked.file.size / 1024).toFixed(1)} KB</div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 text-muted-foreground">
          <UploadCloud className="h-10 w-10 text-primary" />
          <div className="font-medium text-foreground">Drag & drop {kind.toUpperCase()} or click to upload</div>
          <div className="text-xs">Max 10MB</div>
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const [picked, setPicked] = useState<Picked>(null);
  const [returnType, setReturnType] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [count, setCount] = useState(0);
  const [clearing, setClearing] = useState(false);

  const refreshCount = async () => {
    const { count } = await supabase.from("invoices").select("*", { count: "exact", head: true });
    setCount(count ?? 0);
  };
  useEffect(() => { refreshCount(); }, []);

  const startUpload = async () => {
    if (!picked) { toast.error("Pick a file first"); return; }
    if (!returnType) { toast.error("Select a return type"); return; }
    setUploading(true); setProgress(10);
    try {
      const text = await picked.file.text();
      setProgress(35);
      let raw: Record<string, any>[] = [];
      if (picked.kind === "csv") {
        raw = parseCSV(text);
      } else {
        const j = JSON.parse(text);
        raw = Array.isArray(j) ? j : Array.isArray(j?.invoices) ? j.invoices : Array.isArray(j?.data) ? j.data : [];
      }
      if (raw.length === 0) throw new Error("No rows found in file");
      setProgress(60);
      const rows = raw.map((r, i) => normalize(r, i, returnType));
      console.log("[Upload] headers:", Object.keys(raw[0] || {}), "sample parsed:", rows.slice(0, 3));
      const mismatchCount = rows.filter((r) => r.status === "Mismatched").length;
      const allZero = rows.every((r) => r.tax_expected === 0 && r.tax_found === 0);
      if (allZero) {
        toast.warning("Couldn't detect tax columns. Headers seen: " + Object.keys(raw[0] || {}).join(", "));
      }
      // chunk inserts
      const chunkSize = 200;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        const { error } = await supabase.from("invoices").insert(chunk);
        if (error) throw error;
        inserted += chunk.length;
        setProgress(60 + Math.round((inserted / rows.length) * 35));
      }
      setProgress(100);
      toast.success(`Imported ${rows.length} rows · ${mismatchCount} mismatches detected`);
      setPicked(null); setReturnType("");
      await refreshCount();
      setTimeout(() => setProgress(0), 800);
    } catch (e: any) {
      toast.error(`Upload failed: ${e?.message ?? "unknown error"}`);
      setProgress(0);
    } finally {
      setUploading(false);
    }
  };

  const clearAll = async () => {
    setClearing(true);
    const { error } = await supabase.from("invoices").delete().not("id", "is", null);
    setClearing(false);
    if (error) { toast.error(`Couldn't clear data: ${error.message}`); return; }
    toast.success("All uploaded data cleared");
    refreshCount();
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Upload Data</h1>
          <p className="text-sm text-muted-foreground">Upload GST returns or purchase registers to reconcile.</p>
        </div>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="border-danger/40 text-danger hover:bg-danger/10 hover:text-danger" disabled={count === 0 || clearing}>
              <Trash2 className="h-4 w-4 mr-2" />
              {clearing ? "Clearing…" : "Clear Uploaded Data"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all uploaded data?</AlertDialogTitle>
              <AlertDialogDescription>
                This permanently removes all {count} invoice records. All analytics will reset to sample data. This action can't be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={clearAll}>Yes, clear everything</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <div className="glass rounded-xl p-4 flex items-center gap-3">
        <Database className="h-5 w-5 text-primary" />
        <div className="text-sm">
          <span className="text-muted-foreground">Currently in database:</span>{" "}
          <span className="font-semibold">{count.toLocaleString()} invoice{count === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div className="glass rounded-xl p-5 space-y-3">
        <label className="text-sm font-medium">Return Type</label>
        <Select value={returnType} onValueChange={setReturnType}>
          <SelectTrigger><SelectValue placeholder="Select return type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="GSTR-1">GSTR-1</SelectItem>
            <SelectItem value="GSTR-2B">GSTR-2B</SelectItem>
            <SelectItem value="GSTR-3B">GSTR-3B</SelectItem>
            <SelectItem value="Purchase Register">Purchase Register</SelectItem>
            <SelectItem value="e-Invoice">e-Invoice</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Expected columns (any case): <code>invoice_no, supplier_gstin, buyer_gstin, tax_expected, tax_found</code>.
          Optional: <code>mismatch_type, risk_level, status</code>. Missing values are inferred.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <DropZone kind="csv" picked={picked} onPick={(f) => setPicked({ file: f, kind: "csv" })} />
        <DropZone kind="json" picked={picked} onPick={(f) => setPicked({ file: f, kind: "json" })} />
      </div>

      {picked && (
        <div className="glass rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-5 w-5 text-success" />
            <div>
              <div className="text-sm font-medium">{picked.file.name}</div>
              <div className="text-xs text-muted-foreground">{(picked.file.size / 1024).toFixed(1)} KB · {picked.kind.toUpperCase()}</div>
            </div>
          </div>
          <Button size="icon" variant="ghost" onClick={() => setPicked(null)}><X className="h-4 w-4" /></Button>
        </div>
      )}

      {(uploading || progress > 0) && (
        <div className="space-y-1">
          <Progress value={progress} />
          <div className="text-xs text-muted-foreground">{progress}%</div>
        </div>
      )}

      <Button className="w-full sm:w-auto" onClick={startUpload} disabled={uploading}>
        <UploadCloud className="h-4 w-4 mr-2" /> {uploading ? "Importing…" : "Upload & Import"}
      </Button>
    </div>
  );
}