DROP POLICY IF EXISTS biz_select_app_settings ON public.app_settings;

CREATE POLICY biz_select_app_settings ON public.app_settings
FOR SELECT
TO authenticated
USING (
  business_id IS NOT NULL
  AND public.is_business_member(auth.uid(), business_id)
);