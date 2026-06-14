
-- Revoke public/anon EXECUTE on SECURITY DEFINER functions that should not be callable anonymously.
REVOKE EXECUTE ON FUNCTION public.handle_new_business() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.prevent_last_admin_removal() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_business(text, text, text) FROM PUBLIC, anon;

-- Restrictive policy on app_settings: block all writes where business_id IS NULL.
-- (The existing permissive write policy already requires business_id IS NOT NULL,
--  but a restrictive guard ensures no privileged future path can insert NULL-business rows.)
DROP POLICY IF EXISTS app_settings_block_null_writes ON public.app_settings;
CREATE POLICY app_settings_block_null_writes
ON public.app_settings
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (business_id IS NOT NULL)
WITH CHECK (business_id IS NOT NULL);
