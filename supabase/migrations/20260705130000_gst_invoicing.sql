-- GST invoicing fields ---------------------------------------------------------
-- GSTIN on the business (seller) and parties (buyers/suppliers). The first two
-- digits of a GSTIN are the state code — the app compares seller vs buyer state
-- to decide CGST+SGST (intra-state) vs IGST (inter-state) on invoices.

ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.customers  ADD COLUMN IF NOT EXISTS gstin TEXT;
ALTER TABLE public.dealers    ADD COLUMN IF NOT EXISTS gstin TEXT;

-- Opening balance per party (khata starting point). Positive = customer owes
-- us / we owe the dealer at the time they were added.
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS opening_balance NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.dealers   ADD COLUMN IF NOT EXISTS opening_balance NUMERIC NOT NULL DEFAULT 0;

-- Item catalog: HSN/SAC code, GST slab, and default selling price.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS hsn TEXT;
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS gst_rate NUMERIC
  CHECK (gst_rate IS NULL OR gst_rate IN (0, 5, 12, 18, 28));
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS price NUMERIC
  CHECK (price IS NULL OR price >= 0);

-- Per-line GST rate, snapshotted from the item's slab when the sale is saved,
-- so changing an item's slab later never rewrites historical invoices.
-- NULL = fall back to the sale-level gst_rate (legacy sales).
ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS gst_rate NUMERIC
  CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 100));
