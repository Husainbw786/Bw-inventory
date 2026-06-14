
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0;

-- Backfill: sales already flagged payment_received get amount_paid = total of their lines.
UPDATE public.sales s
SET amount_paid = COALESCE((
  SELECT SUM(l.qty * l.rate) FROM public.sale_lines l WHERE l.sale_id = s.id
), 0)
WHERE s.payment_received = true AND s.amount_paid = 0;
