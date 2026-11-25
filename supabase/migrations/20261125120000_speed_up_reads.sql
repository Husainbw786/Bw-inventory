-- Speed up reads for businesses with a lot of data.
--
-- 1) Read policies ran is_business_member(auth.uid(), business_id) once per
--    row. They now compare business_id against the caller's business list,
--    which Postgres works out once per query (Supabase's recommended pattern).
-- 2) sale_lines had no business_id, so its read policy looked up the parent
--    sale for every line and the app had to join sales to filter. It now
--    carries business_id (filled by a trigger, never by the client).
-- 3) Indexes matching the app's paging order (business_id, created_at, id).
--
-- Write policies are unchanged apart from evaluating auth.uid() once.
-- Safe to run more than once.

-- 1) The caller's businesses, evaluated once per statement ------------------
CREATE OR REPLACE FUNCTION public.my_business_ids()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT business_id FROM public.business_members WHERE user_id = auth.uid()
$$;
REVOKE EXECUTE ON FUNCTION public.my_business_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_business_ids() TO authenticated;

-- 2) sale_lines.business_id -------------------------------------------------
ALTER TABLE public.sale_lines ADD COLUMN IF NOT EXISTS business_id UUID
  REFERENCES public.businesses(id) ON DELETE CASCADE;

UPDATE public.sale_lines l SET business_id = s.business_id
FROM public.sales s
WHERE s.id = l.sale_id AND l.business_id IS DISTINCT FROM s.business_id;

ALTER TABLE public.sale_lines ALTER COLUMN business_id SET NOT NULL;

-- Always copied from the parent sale, so a client can't point a line at
-- another business.
CREATE OR REPLACE FUNCTION public.sale_lines_set_business_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  SELECT business_id INTO NEW.business_id FROM public.sales WHERE id = NEW.sale_id;
  RETURN NEW;
END; $$;
REVOKE EXECUTE ON FUNCTION public.sale_lines_set_business_id() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sale_lines_set_business_id_trg ON public.sale_lines;
CREATE TRIGGER sale_lines_set_business_id_trg
BEFORE INSERT OR UPDATE OF sale_id, business_id ON public.sale_lines
FOR EACH ROW EXECUTE FUNCTION public.sale_lines_set_business_id();

-- 3) Read policies ----------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['items','dealers','customers','purchases','sales','expenses','payments','stock_adjustments','sale_lines'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "biz_select_%1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "biz_select_%1$s" ON public.%1$I FOR SELECT TO authenticated
      USING (business_id IN (SELECT public.my_business_ids()))', t);
  END LOOP;
END $$;

-- Write policies: same rules, auth.uid() evaluated once per statement.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['items','dealers','customers','purchases','sales','expenses','payments','stock_adjustments'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "biz_insert_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "biz_update_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "biz_delete_%1$s" ON public.%1$I', t);
    EXECUTE format('CREATE POLICY "biz_insert_%1$s" ON public.%1$I FOR INSERT TO authenticated
      WITH CHECK (public.can_write_business((SELECT auth.uid()), business_id) AND (SELECT auth.uid()) = created_by)', t);
    EXECUTE format('CREATE POLICY "biz_update_%1$s" ON public.%1$I FOR UPDATE TO authenticated
      USING (public.can_write_business((SELECT auth.uid()), business_id)
             AND ((SELECT auth.uid()) = created_by OR public.is_business_admin((SELECT auth.uid()), business_id)))', t);
    EXECUTE format('CREATE POLICY "biz_delete_%1$s" ON public.%1$I FOR DELETE TO authenticated
      USING ((SELECT auth.uid()) = created_by OR public.is_business_admin((SELECT auth.uid()), business_id))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "biz_insert_sale_lines" ON public.sale_lines;
DROP POLICY IF EXISTS "biz_update_sale_lines" ON public.sale_lines;
DROP POLICY IF EXISTS "biz_delete_sale_lines" ON public.sale_lines;
CREATE POLICY "biz_insert_sale_lines" ON public.sale_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.can_write_business((SELECT auth.uid()), s.business_id)));
CREATE POLICY "biz_update_sale_lines" ON public.sale_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.can_write_business((SELECT auth.uid()), s.business_id)));
CREATE POLICY "biz_delete_sale_lines" ON public.sale_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND (s.created_by = (SELECT auth.uid()) OR public.is_business_admin((SELECT auth.uid()), s.business_id))));

-- 4) Indexes in the order the app pages through rows -------------------------
CREATE INDEX IF NOT EXISTS items_biz_created_idx             ON public.items             (business_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS dealers_biz_created_idx           ON public.dealers           (business_id, created_at, id);
CREATE INDEX IF NOT EXISTS customers_biz_created_idx         ON public.customers         (business_id, created_at, id);
CREATE INDEX IF NOT EXISTS purchases_biz_created_idx         ON public.purchases         (business_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS sales_biz_created_idx             ON public.sales             (business_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS expenses_biz_created_idx          ON public.expenses          (business_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS payments_biz_created_idx          ON public.payments          (business_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS stock_adjustments_biz_created_idx ON public.stock_adjustments (business_id, created_at DESC, id);
CREATE INDEX IF NOT EXISTS sale_lines_biz_id_idx             ON public.sale_lines        (business_id, id);
-- Membership lookups behind every policy.
CREATE INDEX IF NOT EXISTS business_members_user_biz_idx     ON public.business_members  (user_id, business_id, role);

ANALYZE public.items, public.dealers, public.customers, public.purchases, public.sales,
        public.sale_lines, public.expenses, public.payments, public.stock_adjustments, public.business_members;
