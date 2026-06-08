-- Shift the admin model: admins are no longer a separate username/password
-- account. An "admin" is simply a Supabase user whose email is on this
-- allowlist. They sign in to the main app as normal and get an Admin Panel
-- button. Inviting an admin = adding an email (no password).

-- Password is no longer required.
ALTER TABLE public.admins ALTER COLUMN password_hash DROP NOT NULL;

-- Make danialhussin71@gmail.com the (super / unremovable) admin and drop the
-- old password-based seed account, which can no longer log in anywhere.
DELETE FROM public.admins WHERE email = 'admin@valzachi.ai';
INSERT INTO public.admins (email, is_super)
VALUES ('danialhussin71@gmail.com', true)
ON CONFLICT (email) DO UPDATE SET is_super = true;

-- Email-only admin invite (no password hash).
CREATE OR REPLACE FUNCTION public.admin_create_email(p_secret text, p_email text)
RETURNS TABLE(id uuid, email text, is_super boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  INSERT INTO public.admins(email, is_super) VALUES (lower(p_email), false)
  RETURNING admins.id INTO v_id;
  RETURN QUERY SELECT a.id, a.email, a.is_super, a.created_at FROM public.admins a WHERE a.id = v_id;
END; $$;
GRANT EXECUTE ON FUNCTION public.admin_create_email(text, text) TO anon, authenticated;

-- Lets a signed-in user check (only) their own admin status, based on the
-- email in their JWT. Safe to expose to authenticated clients: it reveals
-- nothing about other accounts.
CREATE OR REPLACE FUNCTION public.current_user_is_admin()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
GRANT EXECUTE ON FUNCTION public.current_user_is_admin() TO anon, authenticated;
