-- Audit log for admin "sign in as user" (impersonation). Written only by
-- the service-role key (server-side, inside the admin-protected route), so
-- RLS is enabled with no policies to keep it invisible to anon/auth roles.

CREATE TABLE IF NOT EXISTS public.admin_impersonation_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid,
  admin_email text NOT NULL,
  user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  user_email  text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz
);
ALTER TABLE public.admin_impersonation_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS admin_impersonation_log_started_idx
  ON public.admin_impersonation_log(started_at DESC);
