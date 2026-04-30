
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no TEXT NOT NULL,
  supplier_gstin TEXT NOT NULL,
  buyer_gstin TEXT NOT NULL,
  tax_expected NUMERIC NOT NULL DEFAULT 0,
  tax_found NUMERIC NOT NULL DEFAULT 0,
  mismatch_type TEXT,
  risk_level TEXT NOT NULL DEFAULT 'Low',
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL,
  total INT NOT NULL DEFAULT 0,
  matched INT NOT NULL DEFAULT 0,
  mismatched INT NOT NULL DEFAULT 0,
  itc_at_risk NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read invoices" ON public.invoices FOR SELECT USING (true);
CREATE POLICY "Public read runs" ON public.reconciliation_runs FOR SELECT USING (true);

CREATE POLICY "Auth insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Auth update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Auth insert runs" ON public.reconciliation_runs FOR INSERT TO authenticated WITH CHECK (true);

INSERT INTO public.invoices (invoice_no, supplier_gstin, buyer_gstin, tax_expected, tax_found, mismatch_type, risk_level, status) VALUES
('INV-1001','27AABCU9603R1ZM','29AAACI1681G1Z0',18000,18000,'None','Low','Matched'),
('INV-1002','27AABCU9603R1ZM','07AAACR4849R1Z3',9000,9000,'None','Low','Matched'),
('INV-1003','29AAACI1681G1Z0','27AABCU9603R1ZM',27000,27000,'None','Low','Matched'),
('INV-1004','07AAACR4849R1Z3','27AABCU9603R1ZM',12500,12500,'None','Low','Matched'),
('INV-1005','29AAACI1681G1Z0','07AAACR4849R1Z3',45000,45000,'None','Low','Matched'),
('INV-1006','27AABCU9603R1ZM','29AAACI1681G1Z0',15000,15000,'None','Low','Matched'),
('INV-1007','29AAACI1681G1Z0','27AABCU9603R1ZM',32000,28000,'Tax Mismatch','Medium','Mismatched'),
('INV-1008','07AAACR4849R1Z3','27AABCU9603R1ZM',54000,0,'Missing in GSTR-2B','High','Mismatched'),
('INV-1009','27AABCU9603R1ZM','29AAACI1681G1Z0',21000,18500,'Rate Mismatch','Medium','Mismatched'),
('INV-1010','29AAACI1681G1Z0','07AAACR4849R1Z3',36500,0,'Missing Invoice','High','Mismatched');

INSERT INTO public.reconciliation_runs (period, total, matched, mismatched, itc_at_risk) VALUES
('Mar 2025', 10, 6, 4, 124500),
('Feb 2025', 8, 7, 1, 32000);
