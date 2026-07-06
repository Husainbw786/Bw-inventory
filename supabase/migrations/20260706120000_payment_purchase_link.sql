-- Link "Paid now" khata entries to their purchase, mirroring sale_id: deleting
-- a purchase takes its payment along, so the dealer khata can't drift into
-- phantom credit. Payments created before this column existed have no link and
-- cannot be backfilled — they stay as standalone entries.
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS purchase_id UUID
  REFERENCES public.purchases(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS payments_purchase_id_idx ON public.payments (purchase_id);
