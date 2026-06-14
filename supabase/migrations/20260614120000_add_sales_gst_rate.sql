-- Optional per-sale GST rate (percent). NULL or 0 means no GST on that bill.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS gst_rate numeric;
