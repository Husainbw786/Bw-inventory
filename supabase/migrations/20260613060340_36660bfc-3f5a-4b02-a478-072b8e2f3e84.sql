
CREATE OR REPLACE FUNCTION public.create_business(
  _name TEXT,
  _phone TEXT DEFAULT NULL,
  _address TEXT DEFAULT NULL
)
RETURNS public.businesses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_row public.businesses;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;
  IF _name IS NULL OR length(btrim(_name)) = 0 THEN
    RAISE EXCEPTION 'Business name is required';
  END IF;

  INSERT INTO public.businesses (name, phone, address, owner_id)
  VALUES (btrim(_name), NULLIF(btrim(_phone), ''), NULLIF(btrim(_address), ''), v_uid)
  RETURNING * INTO v_row;

  -- handle_new_business trigger inserts the admin membership; ensure idempotency
  INSERT INTO public.business_members (business_id, user_id, role)
  VALUES (v_row.id, v_uid, 'admin')
  ON CONFLICT (business_id, user_id) DO UPDATE SET role = 'admin';

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_business(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_business(TEXT, TEXT, TEXT) TO authenticated;
