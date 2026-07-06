-- 1) PAYMENTS LEDGER ---------------------------------------------------------
-- Dated money movements per party (khata). party_type decides direction:
--   customer → money received by the business, dealer → money paid out.
-- Negative amount = correction/refund entry.
-- Sale-linked rows are created by the app whenever a sale's amount_paid
-- changes, so the ledger and per-sale paid figures stay in sync by design.

CREATE TABLE public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  party_type TEXT NOT NULL CHECK (party_type IN ('customer','dealer')),
  party_id UUID NOT NULL, -- customers.id or dealers.id depending on party_type (no cross-table FK possible)
  -- CASCADE: a deleted sale takes its linked ledger rows with it, otherwise the
  -- party balance would show phantom credit. Standalone entries have sale_id NULL.
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC NOT NULL CHECK (amount <> 0),
  mode TEXT CHECK (mode IS NULL OR mode IN ('cash','upi','bank','cheque','other')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.payments (business_id);
CREATE INDEX ON public.payments (party_id);
CREATE INDEX ON public.payments (sale_id);
CREATE INDEX ON public.payments (date DESC);

CREATE POLICY "biz_select_payments" ON public.payments FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "biz_insert_payments" ON public.payments FOR INSERT TO authenticated
  WITH CHECK (public.can_write_business(auth.uid(), business_id) AND auth.uid() = created_by);
CREATE POLICY "biz_update_payments" ON public.payments FOR UPDATE TO authenticated
  USING (public.can_write_business(auth.uid(), business_id)
         AND (auth.uid() = created_by OR public.is_business_admin(auth.uid(), business_id)));
CREATE POLICY "biz_delete_payments" ON public.payments FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_business_admin(auth.uid(), business_id));

-- Backfill: one ledger entry per sale that already has money received,
-- so historical outstanding balances start correct.
INSERT INTO public.payments (business_id, party_type, party_id, sale_id, date, amount, notes, created_by, created_at)
SELECT s.business_id, 'customer', s.customer_id, s.id, s.date, s.amount_paid,
       'Backfilled from sale record', s.created_by, s.created_at
FROM public.sales s
WHERE s.amount_paid > 0 AND s.customer_id IS NOT NULL AND s.business_id IS NOT NULL;

-- Dealer khata starts settled: purchases made before the ledger existed are
-- assumed paid (the app never tracked dealer payments until now, so leaving
-- them open would show every dealer's lifetime purchases as owed). Real old
-- dues should be entered as the dealer's opening balance instead.
INSERT INTO public.payments (business_id, party_type, party_id, date, amount, notes, created_at)
SELECT p.business_id, 'dealer', p.dealer_id, CURRENT_DATE, SUM(p.qty * p.rate),
       'Backfilled: purchases before khata assumed settled', now()
FROM public.purchases p
WHERE p.dealer_id IS NOT NULL AND p.business_id IS NOT NULL
GROUP BY p.business_id, p.dealer_id
HAVING SUM(p.qty * p.rate) > 0;

-- 2) SEQUENTIAL BILL NUMBERS -------------------------------------------------
-- GST invoices need a consecutive serial per business; UUID slices don't cut it.
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS bill_no INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS sales_bill_no_per_business
  ON public.sales (business_id, bill_no) WHERE bill_no IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assign_bill_no()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_bill AND NEW.bill_no IS NULL AND NEW.business_id IS NOT NULL THEN
    -- Serialize per business so concurrent inserts can't grab the same number.
    PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text));
    SELECT COALESCE(MAX(bill_no), 0) + 1 INTO NEW.bill_no
    FROM public.sales WHERE business_id = NEW.business_id;
  END IF;
  -- Once assigned, a bill number is never cleared or reused (audit trail),
  -- even if the sale is later unmarked as a bill.
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.assign_bill_no() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS assign_bill_no_trg ON public.sales;
CREATE TRIGGER assign_bill_no_trg
BEFORE INSERT OR UPDATE OF is_bill ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.assign_bill_no();

-- Backfill existing bills in chronological order per business.
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY business_id ORDER BY date, created_at) AS rn
  FROM public.sales
  WHERE is_bill = true AND business_id IS NOT NULL
)
UPDATE public.sales s SET bill_no = n.rn
FROM numbered n WHERE s.id = n.id AND s.bill_no IS NULL;

-- 3) STOCK ADJUSTMENTS -------------------------------------------------------
-- Opening stock, damage/loss, count corrections, and returns.
-- qty > 0 adds stock, qty < 0 removes it.
CREATE TABLE public.stock_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  qty NUMERIC NOT NULL CHECK (qty <> 0),
  reason TEXT NOT NULL CHECK (reason IN ('opening','correction','damage','sale_return','purchase_return')),
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_adjustments TO authenticated;
GRANT ALL ON public.stock_adjustments TO service_role;
ALTER TABLE public.stock_adjustments ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.stock_adjustments (business_id);
CREATE INDEX ON public.stock_adjustments (item_id);
CREATE INDEX ON public.stock_adjustments (date DESC);

CREATE POLICY "biz_select_stock_adjustments" ON public.stock_adjustments FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), business_id));
CREATE POLICY "biz_insert_stock_adjustments" ON public.stock_adjustments FOR INSERT TO authenticated
  WITH CHECK (public.can_write_business(auth.uid(), business_id) AND auth.uid() = created_by);
CREATE POLICY "biz_update_stock_adjustments" ON public.stock_adjustments FOR UPDATE TO authenticated
  USING (public.can_write_business(auth.uid(), business_id)
         AND (auth.uid() = created_by OR public.is_business_admin(auth.uid(), business_id)));
CREATE POLICY "biz_delete_stock_adjustments" ON public.stock_adjustments FOR DELETE TO authenticated
  USING (auth.uid() = created_by OR public.is_business_admin(auth.uid(), business_id));

-- Stock availability now includes adjustments: purchases + adjustments − sold.
CREATE OR REPLACE FUNCTION public.enforce_sale_line_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_business_id uuid;
  v_uid uuid := auth.uid();
  v_purchased numeric;
  v_adjusted numeric;
  v_sold numeric;
  v_available numeric;
BEGIN
  IF NEW.item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.business_id INTO v_business_id
  FROM public.sales s
  WHERE s.id = NEW.sale_id;

  IF v_business_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(p.qty), 0) INTO v_purchased
  FROM public.purchases p
  WHERE p.item_id = NEW.item_id
    AND p.business_id = v_business_id;

  SELECT COALESCE(SUM(a.qty), 0) INTO v_adjusted
  FROM public.stock_adjustments a
  WHERE a.item_id = NEW.item_id
    AND a.business_id = v_business_id;

  SELECT COALESCE(SUM(sl.qty), 0) INTO v_sold
  FROM public.sale_lines sl
  JOIN public.sales s ON s.id = sl.sale_id
  WHERE sl.item_id = NEW.item_id
    AND s.business_id = v_business_id
    AND sl.id <> NEW.id;

  v_available := v_purchased + v_adjusted - v_sold - NEW.qty;

  IF v_available < 0 THEN
    IF v_uid IS NOT NULL AND public.is_business_admin(v_uid, v_business_id) THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'Not enough stock for this item (short by %)', abs(v_available)
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.enforce_sale_line_stock() FROM PUBLIC, anon, authenticated;
