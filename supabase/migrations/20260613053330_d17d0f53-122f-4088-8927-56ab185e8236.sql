
-- Multi-tenant migration (retry with CASCADE on legacy helpers)

-- 1. Drop legacy helpers WITH CASCADE up front (removes old policies on items/dealers/etc.)
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;
DROP FUNCTION IF EXISTS public.can_write(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.is_approved(uuid) CASCADE;

-- Capture existing roles before dropping the table.
CREATE TEMP TABLE _legacy_roles AS SELECT user_id, role::text AS role FROM public.user_roles;
DROP TABLE IF EXISTS public.user_roles CASCADE;

-- 2. Core tables
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  sheets_spreadsheet_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.businesses TO authenticated;
GRANT ALL ON public.businesses TO service_role;
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER businesses_updated BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.business_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL CHECK (role IN ('admin','editor','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (business_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_members TO authenticated;
GRANT ALL ON public.business_members TO service_role;
ALTER TABLE public.business_members ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.business_members (user_id);
CREATE INDEX ON public.business_members (business_id);

CREATE TABLE public.business_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL CHECK (role IN ('admin','editor','viewer')),
  token TEXT NOT NULL UNIQUE,
  invited_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '14 days'),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.business_invites TO authenticated;
GRANT ALL ON public.business_invites TO service_role;
ALTER TABLE public.business_invites ENABLE ROW LEVEL SECURITY;
CREATE INDEX ON public.business_invites (business_id);
CREATE INDEX ON public.business_invites (lower(email));

-- 3. Security-definer helpers
CREATE OR REPLACE FUNCTION public.is_business_member(_user_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_members
    WHERE user_id = _user_id AND business_id = _business_id)
$$;

CREATE OR REPLACE FUNCTION public.business_role(_user_id uuid, _business_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::text FROM public.business_members
    WHERE user_id = _user_id AND business_id = _business_id LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_business_admin(_user_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_members
    WHERE user_id = _user_id AND business_id = _business_id AND role = 'admin')
$$;

CREATE OR REPLACE FUNCTION public.can_write_business(_user_id uuid, _business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.business_members
    WHERE user_id = _user_id AND business_id = _business_id AND role IN ('admin','editor'))
$$;

REVOKE EXECUTE ON FUNCTION public.is_business_member(uuid, uuid),
  public.business_role(uuid, uuid),
  public.is_business_admin(uuid, uuid),
  public.can_write_business(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_business_member(uuid, uuid),
  public.business_role(uuid, uuid),
  public.is_business_admin(uuid, uuid),
  public.can_write_business(uuid, uuid) TO authenticated;

-- 4. Add business_id to existing tables
ALTER TABLE public.items        ADD COLUMN business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.dealers      ADD COLUMN business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.customers    ADD COLUMN business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.purchases    ADD COLUMN business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.sales        ADD COLUMN business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.expenses     ADD COLUMN business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;
ALTER TABLE public.app_settings ADD COLUMN business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE;

-- 5. Backfill into 'Pioneer Enterprises'
DO $$
DECLARE
  v_owner UUID;
  v_bid UUID;
BEGIN
  SELECT user_id INTO v_owner FROM _legacy_roles WHERE role = 'admin' LIMIT 1;
  IF v_owner IS NULL THEN
    SELECT id INTO v_owner FROM auth.users ORDER BY created_at LIMIT 1;
  END IF;

  IF v_owner IS NOT NULL THEN
    INSERT INTO public.businesses (name, owner_id) VALUES ('Pioneer Enterprises', v_owner)
      RETURNING id INTO v_bid;
    -- trigger handle_new_business already added owner as admin

    INSERT INTO public.business_members (business_id, user_id, role)
    SELECT v_bid, user_id,
           CASE WHEN role = 'staff' THEN 'editor'::app_role
                WHEN role IN ('admin','editor','viewer') THEN role::app_role
                ELSE 'viewer'::app_role END
    FROM _legacy_roles
    ON CONFLICT (business_id, user_id) DO NOTHING;

    UPDATE public.items        SET business_id = v_bid WHERE business_id IS NULL;
    UPDATE public.dealers      SET business_id = v_bid WHERE business_id IS NULL;
    UPDATE public.customers    SET business_id = v_bid WHERE business_id IS NULL;
    UPDATE public.purchases    SET business_id = v_bid WHERE business_id IS NULL;
    UPDATE public.sales        SET business_id = v_bid WHERE business_id IS NULL;
    UPDATE public.expenses     SET business_id = v_bid WHERE business_id IS NULL;
    UPDATE public.app_settings SET business_id = v_bid WHERE business_id IS NULL;
  END IF;
END $$;

-- 6. Owner-as-admin trigger (used by backfill above)
CREATE OR REPLACE FUNCTION public.handle_new_business()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (NEW.id, NEW.owner_id, 'admin')
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = 'admin';
  RETURN NEW;
END; $$;
CREATE TRIGGER business_owner_added AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_business();

CREATE OR REPLACE FUNCTION public.prevent_last_admin_removal()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE remaining INT;
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'admin' THEN
    SELECT COUNT(*) INTO remaining FROM public.business_members
      WHERE business_id = OLD.business_id AND role = 'admin' AND id <> OLD.id;
    IF remaining = 0 THEN RAISE EXCEPTION 'Cannot remove the last admin of a business'; END IF;
  ELSIF TG_OP = 'UPDATE' AND OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    SELECT COUNT(*) INTO remaining FROM public.business_members
      WHERE business_id = OLD.business_id AND role = 'admin' AND id <> OLD.id;
    IF remaining = 0 THEN RAISE EXCEPTION 'Cannot demote the last admin of a business'; END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END; $$;
CREATE TRIGGER members_last_admin_guard BEFORE UPDATE OR DELETE ON public.business_members
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_admin_removal();

-- 7. Enforce NOT NULL + indexes
ALTER TABLE public.items     ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.dealers   ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.customers ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.purchases ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.sales     ALTER COLUMN business_id SET NOT NULL;
ALTER TABLE public.expenses  ALTER COLUMN business_id SET NOT NULL;

CREATE INDEX ON public.items     (business_id);
CREATE INDEX ON public.dealers   (business_id);
CREATE INDEX ON public.customers (business_id);
CREATE INDEX ON public.purchases (business_id);
CREATE INDEX ON public.sales     (business_id);
CREATE INDEX ON public.expenses  (business_id);

-- 8. RLS policies on data tables (legacy ones were removed by CASCADE)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['items','dealers','customers','purchases','sales','expenses'] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "auth_select_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "auth_insert_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "approved_select_%1$s" ON public.%1$I', t);
    EXECUTE format('DROP POLICY IF EXISTS "approved_insert_%1$s" ON public.%1$I', t);

    EXECUTE format('CREATE POLICY "biz_select_%1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_business_member(auth.uid(), business_id))', t);
    EXECUTE format('CREATE POLICY "biz_insert_%1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.can_write_business(auth.uid(), business_id) AND auth.uid() = created_by)', t);
    EXECUTE format('CREATE POLICY "biz_update_%1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.can_write_business(auth.uid(), business_id) AND (auth.uid() = created_by OR public.is_business_admin(auth.uid(), business_id)))', t);
    EXECUTE format('CREATE POLICY "biz_delete_%1$s" ON public.%1$I FOR DELETE TO authenticated USING (auth.uid() = created_by OR public.is_business_admin(auth.uid(), business_id))', t);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "auth_select_sale_lines" ON public.sale_lines;
DROP POLICY IF EXISTS "auth_insert_sale_lines" ON public.sale_lines;
DROP POLICY IF EXISTS "approved_select_sale_lines" ON public.sale_lines;
DROP POLICY IF EXISTS "approved_insert_sale_lines" ON public.sale_lines;

CREATE POLICY "biz_select_sale_lines" ON public.sale_lines FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.is_business_member(auth.uid(), s.business_id)));
CREATE POLICY "biz_insert_sale_lines" ON public.sale_lines FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.can_write_business(auth.uid(), s.business_id)));
CREATE POLICY "biz_update_sale_lines" ON public.sale_lines FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND public.can_write_business(auth.uid(), s.business_id)));
CREATE POLICY "biz_delete_sale_lines" ON public.sale_lines FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.sales s WHERE s.id = sale_id AND (s.created_by = auth.uid() OR public.is_business_admin(auth.uid(), s.business_id))));

DROP POLICY IF EXISTS "auth_select_app_settings" ON public.app_settings;
DROP POLICY IF EXISTS "approved_select_app_settings" ON public.app_settings;
CREATE POLICY "biz_select_app_settings" ON public.app_settings FOR SELECT TO authenticated
  USING (business_id IS NULL OR public.is_business_member(auth.uid(), business_id));
CREATE POLICY "biz_write_app_settings" ON public.app_settings FOR ALL TO authenticated
  USING (business_id IS NOT NULL AND public.is_business_admin(auth.uid(), business_id))
  WITH CHECK (business_id IS NOT NULL AND public.is_business_admin(auth.uid(), business_id));

-- 9. Policies on new tables
CREATE POLICY "businesses_select_member" ON public.businesses FOR SELECT TO authenticated
  USING (public.is_business_member(auth.uid(), id));
CREATE POLICY "businesses_insert_self_owner" ON public.businesses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "businesses_update_admin" ON public.businesses FOR UPDATE TO authenticated
  USING (public.is_business_admin(auth.uid(), id));
CREATE POLICY "businesses_delete_owner" ON public.businesses FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "members_select_same_biz" ON public.business_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_business_member(auth.uid(), business_id));
CREATE POLICY "members_admin_write" ON public.business_members FOR ALL TO authenticated
  USING (public.is_business_admin(auth.uid(), business_id))
  WITH CHECK (public.is_business_admin(auth.uid(), business_id));

CREATE POLICY "invites_admin_all" ON public.business_invites FOR ALL TO authenticated
  USING (public.is_business_admin(auth.uid(), business_id))
  WITH CHECK (public.is_business_admin(auth.uid(), business_id));

-- 10. Simplify handle_new_user (profile only)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
