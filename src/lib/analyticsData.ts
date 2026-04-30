import { supabase } from "@/integrations/supabase/client";

export type AnalyticsInvoice = {
  id: string;
  invoice_no: string;
  supplier_gstin: string;
  buyer_gstin: string;
  tax_expected: number;
  tax_found: number;
  mismatch_type: string | null;
  risk_level: string;
  status: string;
  created_at?: string;
};

const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

const row = (
  i: number,
  supplier_gstin: string,
  buyer_gstin: string,
  tax_expected: number,
  tax_found: number,
  mismatch_type: string | null,
  risk_level: string,
): AnalyticsInvoice => ({
  id: `sample-${i}`,
  invoice_no: `INV-${2030 + i}`,
  supplier_gstin,
  buyer_gstin,
  tax_expected,
  tax_found,
  mismatch_type,
  risk_level,
  status: mismatch_type ? "Mismatched" : "Matched",
  created_at: daysAgo(i),
});

export const SAMPLE_INVOICES: AnalyticsInvoice[] = [
  row(1, "27AABCU9603R1ZM", "29AAACI1681G1Z0", 180000, 132000, "Missing in GSTR-2B", "Critical"),
  row(2, "29AAACI1681G1Z0", "07AAACR4849R1Z3", 90000, 126000, "Excess ITC", "High"),
  row(3, "07AAACR4849R1Z3", "27AABCU9603R1ZM", 270000, 220000, "Missing in GSTR-1", "Critical"),
  row(4, "27AAGCT2345A1Z9", "27AABCU9603R1ZM", 125000, 125000, null, "Low"),
  row(5, "29AABCK7766P1Z2", "29AAACI1681G1Z0", 450000, 410000, "Tax Mismatch", "Medium"),
  row(6, "27AAFCM4321B1Z1", "27AABCU9603R1ZM", 84000, 84000, null, "Low"),
  row(7, "07AABCD9988E1Z6", "29AAACI1681G1Z0", 142000, 121000, "Missing in GSTR-2B", "Medium"),
  row(8, "29AAACO5544Q1Z8", "07AAACR4849R1Z3", 56000, 56000, null, "Low"),
  row(9, "24AAACM5432H1Z9", "27AABCU9603R1ZM", 320000, 260000, "Missing in GSTR-2B", "High"),
  row(10, "19AAACG9876F1Z2", "24AAACM5432H1Z9", 98000, 118000, "Excess ITC", "High"),
  row(11, "07AAACV7766L1Z3", "19AAACG9876F1Z2", 210000, 210000, null, "Low"),
  row(12, "09AAACG3344M1Z6", "24AAACM5432H1Z9", 44000, 36000, "Missing in GSTR-1", "Medium"),
  row(13, "27AABCU9603R1ZM", "27AAGCT2345A1Z9", 76000, 76000, null, "Low"),
  row(14, "29AAACI1681G1Z0", "29AABCK7766P1Z2", 134000, 99000, "Missing in GSTR-2B", "High"),
  row(15, "07AAACR4849R1Z3", "07AABCD9988E1Z6", 188000, 188000, null, "Low"),
  row(16, "24AAACM5432H1Z9", "09AAACG3344M1Z6", 64000, 83000, "Excess ITC", "Medium"),
  row(17, "19AABCC1122K1Z8", "19AAACG9876F1Z2", 154000, 111000, "Tax Mismatch", "High"),
  row(18, "27AAFCM4321B1Z1", "07AAACV7766L1Z3", 72000, 72000, null, "Low"),
];

export const VENDOR_NAMES: Record<string, string> = {
  "27AABCU9603R1ZM": "Mumbai Steel Pvt Ltd",
  "29AAACI1681G1Z0": "Bangalore Traders LLP",
  "07AAACR4849R1Z3": "Delhi Imports Co",
  "27AAGCT2345A1Z9": "Pune Logistics",
  "29AABCK7766P1Z2": "Mysore Exports",
  "27AAFCM4321B1Z1": "Nashik Chemicals",
  "07AABCD9988E1Z6": "Delhi Tex Mills",
  "29AAACO5544Q1Z8": "Hubli Hardware",
  "24AAACM5432H1Z9": "Mehta Chemical Works",
  "19AAACG9876F1Z2": "Ghosh Retail Chain",
  "19AABCC1122K1Z8": "Chakraborty Chemicals",
  "07AAACV7766L1Z3": "Verma Logistics",
  "09AAACG3344M1Z6": "Gupta Pharma Solutions",
};

const STATE_PREFIX: Record<string, string> = {
  "07": "Delhi",
  "09": "Uttar Pradesh",
  "19": "West Bengal",
  "24": "Gujarat",
  "27": "Maharashtra",
  "29": "Karnataka",
};

export const getVendorName = (gstin: string, index = 0) => VENDOR_NAMES[gstin] ?? `Vendor ${index + 1}`;
export const getStateFromGstin = (gstin: string) => STATE_PREFIX[gstin.slice(0, 2)] ?? "India";
export const mismatchAmount = (invoice: AnalyticsInvoice) => Math.abs(Number(invoice.tax_expected) - Number(invoice.tax_found));
export const riskTier = (score: number): "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" =>
  score >= 80 ? "CRITICAL" : score >= 60 ? "HIGH" : score >= 35 ? "MEDIUM" : "LOW";

export const fetchAnalyticsInvoices = async (limit = 10000) => {
  const { data, error } = await supabase.from("invoices").select("*").limit(limit);
  if (error) throw error;
  const rows = (data ?? []).map((invoice) => ({
    ...invoice,
    tax_expected: Number(invoice.tax_expected),
    tax_found: Number(invoice.tax_found),
  })) as AnalyticsInvoice[];
  return rows.length ? { rows, usingSample: false } : { rows: SAMPLE_INVOICES, usingSample: true };
};

export const watchInvoiceChanges = (onChange: () => void) => {
  const channel = supabase
    .channel(`invoices-analytics-${Math.random().toString(36).slice(2)}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, onChange)
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};