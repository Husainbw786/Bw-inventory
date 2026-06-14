ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_received boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;