-- ─────────────────────────────────────────────────────────────────────
-- Admin panel: admins + support_tickets tables and the SECURITY DEFINER
-- RPCs that back them.
--
-- There is no service-role key in this project; every privileged /
-- cross-user read or write goes through a SECURITY DEFINER function
-- guarded by app_secret_check('stripe_db_bridge', secret) — the same
-- pattern the Stripe webhook uses. The admin server routes (protected by
-- their own signed session cookie) call these with STRIPE_DB_BRIDGE_SECRET.
-- ─────────────────────────────────────────────────────────────────────

-- ── Tables ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.admins (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  is_super      boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
-- No policies: only SECURITY DEFINER funcs (below) may read/write. The
-- public anon key — even though it can reach this table name — is denied
-- by RLS, so admin credentials are never exposed client-side.

CREATE SEQUENCE IF NOT EXISTS public.support_ticket_seq START 1000;

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text NOT NULL UNIQUE
                DEFAULT ('VLZ-' || lpad(nextval('public.support_ticket_seq')::text, 6, '0')),
  name          text NOT NULL,
  email         text NOT NULL,
  subject       text,
  message       text NOT NULL,
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
  user_id       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS support_tickets_status_idx  ON public.support_tickets(status);
CREATE INDEX IF NOT EXISTS support_tickets_created_idx ON public.support_tickets(created_at DESC);

-- ── Admin auth RPCs ──────────────────────────────────────────────────
-- Password hashing/verification happens in Node (scrypt). These funcs
-- only store and return the opaque hash string.

CREATE OR REPLACE FUNCTION public.admin_get_by_email(p_secret text, p_email text)
RETURNS TABLE(id uuid, email text, password_hash text, is_super boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  RETURN QUERY
    SELECT a.id, a.email, a.password_hash, a.is_super
    FROM public.admins a WHERE a.email = lower(p_email);
END; $$;

CREATE OR REPLACE FUNCTION public.admin_get_by_id(p_secret text, p_id uuid)
RETURNS TABLE(id uuid, email text, password_hash text, is_super boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  RETURN QUERY
    SELECT a.id, a.email, a.password_hash, a.is_super
    FROM public.admins a WHERE a.id = p_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list(p_secret text)
RETURNS TABLE(id uuid, email text, is_super boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  RETURN QUERY
    SELECT a.id, a.email, a.is_super, a.created_at
    FROM public.admins a ORDER BY a.is_super DESC, a.created_at ASC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_create(p_secret text, p_email text, p_password_hash text)
RETURNS TABLE(id uuid, email text, is_super boolean, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  INSERT INTO public.admins(email, password_hash, is_super)
  VALUES (lower(p_email), p_password_hash, false)
  RETURNING admins.id INTO v_id;
  RETURN QUERY
    SELECT a.id, a.email, a.is_super, a.created_at FROM public.admins a WHERE a.id = v_id;
END; $$;

-- Returns true if deleted, false if not found or protected (super admin).
CREATE OR REPLACE FUNCTION public.admin_delete(p_secret text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_super boolean;
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  SELECT is_super INTO v_super FROM public.admins WHERE id = p_id;
  IF v_super IS NULL THEN RETURN false; END IF;   -- not found
  IF v_super THEN RETURN false; END IF;           -- the primary admin is unremovable
  DELETE FROM public.admins WHERE id = p_id;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_password(p_secret text, p_id uuid, p_new_hash text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  UPDATE public.admins SET password_hash = p_new_hash, updated_at = now() WHERE id = p_id;
END; $$;

-- ── Support ticket RPCs ──────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.support_create_ticket(
  p_secret text, p_name text, p_email text, p_subject text, p_message text, p_user_id uuid DEFAULT NULL
) RETURNS TABLE(id uuid, ticket_number text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  INSERT INTO public.support_tickets(name, email, subject, message, user_id)
  VALUES (p_name, lower(p_email), nullif(btrim(p_subject), ''), p_message, p_user_id)
  RETURNING support_tickets.id INTO v_id;
  RETURN QUERY
    SELECT t.id, t.ticket_number, t.created_at FROM public.support_tickets t WHERE t.id = v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_list_tickets(p_secret text, p_status text DEFAULT NULL)
RETURNS TABLE(
  id uuid, ticket_number text, name text, email text, subject text, message text,
  status text, user_id uuid, created_at timestamptz, updated_at timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  RETURN QUERY
    SELECT t.id, t.ticket_number, t.name, t.email, t.subject, t.message,
           t.status, t.user_id, t.created_at, t.updated_at
    FROM public.support_tickets t
    WHERE p_status IS NULL OR t.status = p_status
    ORDER BY t.created_at DESC;
END; $$;

CREATE OR REPLACE FUNCTION public.admin_update_ticket(p_secret text, p_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);
  UPDATE public.support_tickets SET status = p_status, updated_at = now() WHERE id = p_id;
END; $$;

-- ── Stats RPC ────────────────────────────────────────────────────────
-- Returns one jsonb blob with every figure the dashboard needs.

CREATE OR REPLACE FUNCTION public.admin_dashboard_stats(p_secret text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb;
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);

  WITH sub_calc AS (
    SELECT s.id, s.status, s.created_at, s.updated_at,
           p.name, p.display_name, p.price_cents, p.yearly_price_cents,
           -- A period longer than 45 days is an annual plan; bill it monthly-equivalent.
           CASE WHEN s.current_period_end - s.current_period_start > interval '45 days'
                THEN round(coalesce(p.yearly_price_cents, p.price_cents * 12) / 12.0)
                ELSE p.price_cents END AS monthly_equiv_cents,
           (s.current_period_end - s.current_period_start > interval '45 days') AS is_yearly
    FROM public.subscriptions s JOIN public.plans p ON p.id = s.plan_id
  ),
  mrr AS (
    SELECT coalesce(sum(monthly_equiv_cents), 0)::bigint AS mrr_cents
    FROM sub_calc WHERE status = 'active'
  ),
  tiers AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
             'name', t.name, 'display_name', t.display_name, 'price_cents', t.price_cents,
             'active_count', t.active_count, 'mrr_cents', t.mrr_cents
           ) ORDER BY t.price_cents), '[]'::jsonb) AS data
    FROM (
      SELECT p.name, p.display_name, p.price_cents,
             count(sc.id) FILTER (WHERE sc.status = 'active') AS active_count,
             coalesce(sum(sc.monthly_equiv_cents) FILTER (WHERE sc.status = 'active'), 0)::bigint AS mrr_cents
      FROM public.plans p
      LEFT JOIN sub_calc sc ON sc.name = p.name
      WHERE p.is_active = true
      GROUP BY p.name, p.display_name, p.price_cents
    ) t
  ),
  sub_status AS (
    SELECT jsonb_build_object(
      'active',    count(*) FILTER (WHERE status = 'active'),
      'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
      'past_due',  count(*) FILTER (WHERE status = 'past_due'),
      'trialing',  count(*) FILTER (WHERE status = 'trialing')
    ) AS data FROM public.subscriptions
  ),
  sub_rev_est AS (
    -- Estimated subscription revenue collected to date: billing cycles
    -- elapsed × monthly-equivalent price. Labeled "estimated" in the UI
    -- because this project keeps no per-payment subscription ledger.
    SELECT coalesce(sum(
      monthly_equiv_cents * greatest(1, floor(extract(epoch FROM (
        least(now(), CASE WHEN status = 'cancelled' THEN updated_at ELSE now() END) - created_at
      )) / (30 * 86400))::int)
    ), 0)::bigint AS cents
    FROM sub_calc
  ),
  blueprints AS (
    SELECT count(*) FILTER (WHERE status = 'active') AS sold,
           coalesce(sum(price_cents) FILTER (WHERE status = 'active'), 0)::bigint AS revenue_cents
    FROM public.brand_dna_purchases
  ),
  credit_rev AS (
    SELECT coalesce(sum(coalesce(price_cents, 0)), 0)::bigint AS revenue_cents,
           count(*) AS topup_count
    FROM public.credit_transactions WHERE type = 'purchase'
  ),
  months AS (
    SELECT to_char(date_trunc('month', now()) - (interval '1 month' * gs), 'YYYY-MM') AS month
    FROM generate_series(0, 11) gs
  ),
  signups AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'count', coalesce(c.cnt, 0))
             ORDER BY m.month), '[]'::jsonb) AS data
    FROM months m
    LEFT JOIN (
      SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, count(*) cnt
      FROM public.profiles GROUP BY 1
    ) c ON c.month = m.month
  ),
  revenue_month AS (
    SELECT coalesce(jsonb_agg(jsonb_build_object('month', m.month, 'cents', coalesce(r.cents, 0))
             ORDER BY m.month), '[]'::jsonb) AS data
    FROM months m
    LEFT JOIN (
      SELECT month, sum(cents) cents FROM (
        SELECT to_char(date_trunc('month', purchased_at), 'YYYY-MM') AS month, sum(price_cents) cents
        FROM public.brand_dna_purchases WHERE status = 'active' GROUP BY 1
        UNION ALL
        SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month, sum(coalesce(price_cents, 0)) cents
        FROM public.credit_transactions WHERE type = 'purchase' GROUP BY 1
      ) u GROUP BY month
    ) r ON r.month = m.month
  ),
  recent_users AS (
    SELECT coalesce(jsonb_agg(to_jsonb(ru) ORDER BY ru.created_at DESC), '[]'::jsonb) AS data
    FROM (
      SELECT pr.id, pr.full_name, pr.email, pr.created_at,
             pl.display_name AS plan_display_name,
             exists(SELECT 1 FROM public.brand_dna_purchases bp
                    WHERE bp.user_id = pr.id AND bp.status = 'active') AS has_blueprint
      FROM public.profiles pr
      LEFT JOIN public.subscriptions su ON su.user_id = pr.id AND su.status = 'active'
      LEFT JOIN public.plans pl ON pl.id = su.plan_id
      ORDER BY pr.created_at DESC LIMIT 8
    ) ru
  )
  SELECT jsonb_build_object(
    'kpis', jsonb_build_object(
      'total_users',                  (SELECT count(*) FROM public.profiles),
      'active_subscriptions',         (SELECT count(*) FROM public.subscriptions WHERE status = 'active'),
      'total_subscriptions',          (SELECT count(*) FROM public.subscriptions),
      'mrr_cents',                    (SELECT mrr_cents FROM mrr),
      'arr_cents',                    (SELECT mrr_cents * 12 FROM mrr),
      'blueprints_sold',              (SELECT sold FROM blueprints),
      'blueprint_revenue_cents',      (SELECT revenue_cents FROM blueprints),
      'credit_topup_revenue_cents',   (SELECT revenue_cents FROM credit_rev),
      'credit_topup_count',           (SELECT topup_count FROM credit_rev),
      'one_time_revenue_cents',       (SELECT (SELECT revenue_cents FROM blueprints) + (SELECT revenue_cents FROM credit_rev)),
      'subscription_revenue_estimate_cents', (SELECT cents FROM sub_rev_est),
      'total_revenue_cents',          (SELECT (SELECT revenue_cents FROM blueprints) + (SELECT revenue_cents FROM credit_rev) + (SELECT cents FROM sub_rev_est)),
      'active_brand_dnas',            (SELECT count(*) FROM public.brand_dnas WHERE status = 'active'),
      'total_credit_balance',         (SELECT coalesce(sum(balance), 0) FROM public.credits),
      'open_tickets',                 (SELECT count(*) FROM public.support_tickets WHERE status IN ('open', 'in_progress'))
    ),
    'tiers',            (SELECT data FROM tiers),
    'sub_status',       (SELECT data FROM sub_status),
    'signups_by_month', (SELECT data FROM signups),
    'revenue_by_month', (SELECT data FROM revenue_month),
    'recent_users',     (SELECT data FROM recent_users)
  ) INTO result;

  RETURN result;
END; $$;

-- ── Users list RPC (paginated, searchable) ───────────────────────────

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_secret text, p_limit int DEFAULT 50, p_offset int DEFAULT 0, p_search text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE result jsonb; v_total bigint;
BEGIN
  PERFORM public.app_secret_check('stripe_db_bridge', p_secret);

  SELECT count(*) INTO v_total FROM public.profiles pr
  WHERE p_search IS NULL OR pr.email ILIKE '%' || p_search || '%' OR pr.full_name ILIKE '%' || p_search || '%';

  SELECT jsonb_build_object(
    'total', v_total,
    'users', coalesce(jsonb_agg(to_jsonb(u) ORDER BY u.created_at DESC), '[]'::jsonb)
  ) INTO result
  FROM (
    SELECT pr.id, pr.full_name, pr.email, pr.created_at,
           c.balance AS credit_balance,
           pl.display_name AS plan_display_name,
           su.status AS subscription_status,
           exists(SELECT 1 FROM public.brand_dna_purchases bp
                  WHERE bp.user_id = pr.id AND bp.status = 'active') AS has_blueprint
    FROM public.profiles pr
    LEFT JOIN public.credits c ON c.user_id = pr.id
    LEFT JOIN public.subscriptions su ON su.user_id = pr.id AND su.status = 'active'
    LEFT JOIN public.plans pl ON pl.id = su.plan_id
    WHERE p_search IS NULL OR pr.email ILIKE '%' || p_search || '%' OR pr.full_name ILIKE '%' || p_search || '%'
    ORDER BY pr.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) u;

  RETURN result;
END; $$;

-- ── Grants ───────────────────────────────────────────────────────────
-- Runtime uses the anon key; the secret guard (not the role) is the gate.
GRANT EXECUTE ON FUNCTION public.admin_get_by_email(text, text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_by_id(text, uuid)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list(text)                      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create(text, text, text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete(text, uuid)              TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_password(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.support_create_ticket(text, text, text, text, text, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_tickets(text, text)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_ticket(text, uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_dashboard_stats(text)           TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text) TO anon, authenticated;

-- ── Seed the primary (unremovable) admin ─────────────────────────────
-- admin@valzachi.ai / Admin979  (scrypt hash; change via Settings)
INSERT INTO public.admins(email, password_hash, is_super)
VALUES (
  'admin@valzachi.ai',
  '2efad84f7b376182314f15d387411bbc:8b12ba9f01fdcd188fa39960adcd26541b4b1bafbc5777ad65df580defd20eecec3f44d6a1e9960963cd0422469e3dbb48b44ccd06694ee6893b0d68de6b07f3',
  true
)
ON CONFLICT (email) DO NOTHING;
