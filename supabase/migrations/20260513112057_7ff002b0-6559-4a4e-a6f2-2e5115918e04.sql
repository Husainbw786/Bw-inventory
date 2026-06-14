
CREATE TABLE public.app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "approved_select_app_settings" ON public.app_settings
  FOR SELECT TO authenticated USING (is_approved(auth.uid()));

CREATE POLICY "admin_insert_app_settings" ON public.app_settings
  FOR INSERT TO authenticated WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_update_app_settings" ON public.app_settings
  FOR UPDATE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin_delete_app_settings" ON public.app_settings
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
