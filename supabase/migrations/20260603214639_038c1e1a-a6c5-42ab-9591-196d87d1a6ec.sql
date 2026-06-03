
-- 1) telegram_events
CREATE TABLE public.telegram_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  kind text NOT NULL, -- whitelist_reject | route_decision | next_reject | rate_limited | turnstile_fail
  source text, -- start | callback | done
  reason text,
  intent text,
  host text,
  path text,
  next_path text,
  vacancy_count int,
  ip_hash text,
  ua_hash text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX telegram_events_created_at_idx ON public.telegram_events (created_at DESC);
CREATE INDEX telegram_events_kind_idx ON public.telegram_events (kind, reason);

GRANT SELECT, INSERT ON public.telegram_events TO authenticated;
GRANT ALL ON public.telegram_events TO service_role;

ALTER TABLE public.telegram_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin reads telegram_events"
  ON public.telegram_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- inserts go through the SECURITY DEFINER RPC, not directly
CREATE POLICY "noone inserts directly"
  ON public.telegram_events FOR INSERT
  TO authenticated
  WITH CHECK (false);

-- 2) rate_limits
CREATE TABLE public.rate_limits (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count int NOT NULL DEFAULT 0
);

GRANT ALL ON public.rate_limits TO service_role;

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
-- no policies → only service_role bypasses RLS

-- 3) log_telegram_event RPC for clients (limited kinds)
CREATE OR REPLACE FUNCTION public.log_telegram_event(
  _kind text,
  _source text DEFAULT NULL,
  _reason text DEFAULT NULL,
  _intent text DEFAULT NULL,
  _host text DEFAULT NULL,
  _path text DEFAULT NULL,
  _next_path text DEFAULT NULL,
  _vacancy_count int DEFAULT NULL,
  _meta jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _kind NOT IN ('route_decision','next_reject') THEN
    RAISE EXCEPTION 'forbidden_kind';
  END IF;
  IF length(coalesce(_path,'')) > 512 OR length(coalesce(_next_path,'')) > 1024 THEN
    RAISE EXCEPTION 'path_too_long';
  END IF;
  INSERT INTO public.telegram_events(kind, source, reason, intent, host, path, next_path, vacancy_count, meta)
  VALUES (_kind, _source, _reason, _intent, _host, _path, _next_path, _vacancy_count, coalesce(_meta,'{}'::jsonb));
END $$;

GRANT EXECUTE ON FUNCTION public.log_telegram_event(text,text,text,text,text,text,text,int,jsonb) TO authenticated, anon;

-- 4) admin metrics RPC
CREATE OR REPLACE FUNCTION public.admin_telegram_metrics(_hours int DEFAULT 24)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_since timestamptz := now() - make_interval(hours => greatest(_hours,1));
  v_by_reason jsonb;
  v_route jsonb;
  v_totals jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'reason',reason,'n',n) ORDER BY n DESC),'[]'::jsonb)
    INTO v_by_reason
  FROM (
    SELECT kind, coalesce(reason,'(none)') AS reason, count(*)::int AS n
    FROM public.telegram_events
    WHERE created_at >= v_since
    GROUP BY 1,2
  ) t;

  SELECT jsonb_build_object(
    'zero',  coalesce(sum(CASE WHEN vacancy_count = 0 THEN 1 ELSE 0 END),0),
    'one',   coalesce(sum(CASE WHEN vacancy_count = 1 THEN 1 ELSE 0 END),0),
    'multi', coalesce(sum(CASE WHEN vacancy_count >= 2 THEN 1 ELSE 0 END),0),
    'total', count(*)
  ) INTO v_route
  FROM public.telegram_events
  WHERE created_at >= v_since AND kind = 'route_decision';

  SELECT jsonb_object_agg(kind, n) INTO v_totals
  FROM (
    SELECT kind, count(*)::int AS n
    FROM public.telegram_events
    WHERE created_at >= v_since
    GROUP BY 1
  ) t;

  RETURN jsonb_build_object(
    'since', v_since,
    'totals', coalesce(v_totals,'{}'::jsonb),
    'by_reason', v_by_reason,
    'route', coalesce(v_route,'{}'::jsonb)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.admin_telegram_metrics(int) TO authenticated;

-- 5) rl_hit RPC for edge functions
CREATE OR REPLACE FUNCTION public.rl_hit(_key text, _window_sec int, _limit int)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_row public.rate_limits;
BEGIN
  INSERT INTO public.rate_limits(key, window_start, count)
  VALUES (_key, v_now, 1)
  ON CONFLICT (key) DO UPDATE
    SET count = CASE
      WHEN public.rate_limits.window_start < v_now - make_interval(secs => _window_sec)
        THEN 1
      ELSE public.rate_limits.count + 1
    END,
    window_start = CASE
      WHEN public.rate_limits.window_start < v_now - make_interval(secs => _window_sec)
        THEN v_now
      ELSE public.rate_limits.window_start
    END
  RETURNING * INTO v_row;
  RETURN v_row.count <= _limit;
END $$;

GRANT EXECUTE ON FUNCTION public.rl_hit(text,int,int) TO service_role;
