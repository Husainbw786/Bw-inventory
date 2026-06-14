
DROP POLICY IF EXISTS "Authenticated can view roles" ON public.user_roles;

CREATE POLICY "Users view own role"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
