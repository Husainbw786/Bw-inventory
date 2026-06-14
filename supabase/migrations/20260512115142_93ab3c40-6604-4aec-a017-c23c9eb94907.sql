
-- Migrate existing staff -> editor
UPDATE public.user_roles SET role = 'editor' WHERE role = 'staff';

-- Helper: any approved role
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;

CREATE OR REPLACE FUNCTION public.can_write(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','editor')
  )
$$;

-- Update signup trigger: only first user gets admin, others pending
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE user_count INT;
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  RETURN NEW;
END; $$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== Re-do RLS policies =====

-- Helper to redo a table
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['items','dealers','customers','purchases','expenses','sales']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS auth_select_%1$s ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS auth_insert_%1$s ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_update_%1$s ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS owner_delete_%1$s ON public.%1$s', t);

    EXECUTE format($p$CREATE POLICY approved_select_%1$s ON public.%1$s FOR SELECT TO authenticated USING (public.is_approved(auth.uid()))$p$, t);
    EXECUTE format($p$CREATE POLICY writer_insert_%1$s ON public.%1$s FOR INSERT TO authenticated WITH CHECK (public.can_write(auth.uid()) AND auth.uid() = created_by)$p$, t);
    EXECUTE format($p$CREATE POLICY writer_update_%1$s ON public.%1$s FOR UPDATE TO authenticated USING (public.has_role(auth.uid(),'admin') OR (public.can_write(auth.uid()) AND auth.uid() = created_by))$p$, t);
    EXECUTE format($p$CREATE POLICY writer_delete_%1$s ON public.%1$s FOR DELETE TO authenticated USING (public.has_role(auth.uid(),'admin') OR (public.can_write(auth.uid()) AND auth.uid() = created_by))$p$, t);
  END LOOP;
END $$;

-- sale_lines mirror
DROP POLICY IF EXISTS auth_select_sale_lines ON public.sale_lines;
DROP POLICY IF EXISTS auth_insert_sale_lines ON public.sale_lines;
DROP POLICY IF EXISTS owner_update_sale_lines ON public.sale_lines;
DROP POLICY IF EXISTS owner_delete_sale_lines ON public.sale_lines;

CREATE POLICY approved_select_sale_lines ON public.sale_lines FOR SELECT TO authenticated USING (public.is_approved(auth.uid()));
CREATE POLICY writer_insert_sale_lines ON public.sale_lines FOR INSERT TO authenticated
  WITH CHECK (public.can_write(auth.uid()) AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_lines.sale_id AND s.created_by = auth.uid()));
CREATE POLICY writer_update_sale_lines ON public.sale_lines FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_lines.sale_id AND s.created_by = auth.uid() AND public.can_write(auth.uid())));
CREATE POLICY writer_delete_sale_lines ON public.sale_lines FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_lines.sale_id AND s.created_by = auth.uid() AND public.can_write(auth.uid())));
