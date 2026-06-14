
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

  SELECT COALESCE(SUM(sl.qty), 0) INTO v_sold
  FROM public.sale_lines sl
  JOIN public.sales s ON s.id = sl.sale_id
  WHERE sl.item_id = NEW.item_id
    AND s.business_id = v_business_id
    AND sl.id <> NEW.id;

  v_available := v_purchased - v_sold - NEW.qty;

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

DROP TRIGGER IF EXISTS enforce_sale_line_stock_trg ON public.sale_lines;
CREATE TRIGGER enforce_sale_line_stock_trg
BEFORE INSERT OR UPDATE OF item_id, qty, sale_id ON public.sale_lines
FOR EACH ROW EXECUTE FUNCTION public.enforce_sale_line_stock();
