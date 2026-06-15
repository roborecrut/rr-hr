-- ─── 1. Закрываем прямой доступ к таблицам ──────────────────────────────
-- Authenticated и anon больше не могут читать ai_jobs/ai_job_attempts
-- напрямую — только через безопасные RPC и edge-функции. Это предотвращает
-- чтение request_snapshot через явный SELECT столбца.
REVOKE ALL ON public.ai_jobs FROM anon, authenticated;
REVOKE ALL ON public.ai_job_attempts FROM anon, authenticated;
REVOKE ALL ON public.ai_jobs_safe_status FROM anon, authenticated;
-- Сохраняем view как утилиту для service_role.
GRANT SELECT ON public.ai_jobs_safe_status TO service_role;

-- Прежние SELECT-политики оставим (defense in depth), но прав на таблицу
-- нет, так что они теперь не активируются ни для какой обычной роли.

-- ─── 2. Колонка для идемпотентного списания RR ──────────────────────────
ALTER TABLE public.ai_jobs
  ADD COLUMN IF NOT EXISTS credits_idem_key text;
CREATE UNIQUE INDEX IF NOT EXISTS ai_jobs_credits_idem_uq
  ON public.ai_jobs (credits_idem_key)
  WHERE credits_idem_key IS NOT NULL;

-- ─── 3. Триггер: запрет недопустимых переходов статуса и инвариантов ────
CREATE OR REPLACE FUNCTION public.tg_ai_jobs_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_allowed text[];
BEGIN
  -- 3.1 Запрет сброса fallback_used true → false.
  IF OLD.fallback_used = true AND NEW.fallback_used = false THEN
    RAISE EXCEPTION 'ai_jobs_guard: fallback_used cannot be reset' USING ERRCODE = 'check_violation';
  END IF;

  -- 3.2 Запрет сброса credits_status после успешного списания.
  IF OLD.credits_status = 'charged' AND NEW.credits_status = 'not_charged' THEN
    RAISE EXCEPTION 'ai_jobs_guard: credits_status cannot be reset to not_charged' USING ERRCODE = 'check_violation';
  END IF;

  -- 3.3 Запрет изменения credits_idem_key после установки.
  IF OLD.credits_idem_key IS NOT NULL AND NEW.credits_idem_key IS DISTINCT FROM OLD.credits_idem_key THEN
    RAISE EXCEPTION 'ai_jobs_guard: credits_idem_key is immutable' USING ERRCODE = 'check_violation';
  END IF;

  -- 3.4 Запрет смены идемпотентного ключа задачи.
  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'ai_jobs_guard: idempotency_key is immutable' USING ERRCODE = 'check_violation';
  END IF;

  -- 3.5 Переходы статусов — белый список.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := CASE OLD.status
      WHEN 'created'             THEN ARRAY['primary_running','cancelled']
      WHEN 'primary_running'     THEN ARRAY['primary_succeeded','primary_failed','timed_out','cancelled','validation_failed','save_failed']
      WHEN 'primary_succeeded'   THEN ARRAY[]::text[]
      WHEN 'primary_failed'      THEN ARRAY['fallback_available','cancelled']
      WHEN 'fallback_available'  THEN ARRAY['fallback_restarting','fallback_running','cancelled']
      WHEN 'fallback_restarting' THEN ARRAY['fallback_running','fallback_failed','cancelled','timed_out']
      WHEN 'fallback_running'    THEN ARRAY['fallback_succeeded','fallback_failed','timed_out','cancelled','validation_failed','save_failed']
      WHEN 'fallback_succeeded'  THEN ARRAY[]::text[]
      WHEN 'fallback_failed'     THEN ARRAY[]::text[]
      WHEN 'cancelled'           THEN ARRAY[]::text[]
      WHEN 'timed_out'           THEN ARRAY[]::text[]
      WHEN 'save_failed'         THEN ARRAY[]::text[]
      WHEN 'validation_failed'   THEN ARRAY[]::text[]
      ELSE ARRAY[]::text[]
    END;
    IF NOT (NEW.status::text = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ai_jobs_guard: illegal transition % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ai_jobs_guard ON public.ai_jobs;
CREATE TRIGGER ai_jobs_guard
  BEFORE UPDATE ON public.ai_jobs
  FOR EACH ROW EXECUTE FUNCTION public.tg_ai_jobs_guard();

-- ─── 4. Безопасный статус для frontend (без snapshot) ───────────────────
CREATE OR REPLACE FUNCTION public.get_ai_job_safe_status(_job_id uuid)
RETURNS TABLE (
  id uuid,
  job_type text,
  status public.ai_job_status,
  fallback_allowed boolean,
  fallback_used boolean,
  credits_status public.ai_job_credits_status,
  created_at timestamptz,
  updated_at timestamptz,
  completed_at timestamptz,
  last_attempt_provider public.ai_job_provider,
  last_attempt_status public.ai_job_attempt_status,
  last_safe_error_code text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    j.id, j.job_type, j.status, j.fallback_allowed, j.fallback_used,
    j.credits_status, j.created_at, j.updated_at, j.completed_at,
    a.provider, a.status, a.safe_error_code
  FROM public.ai_jobs j
  LEFT JOIN LATERAL (
    SELECT provider, status, safe_error_code
    FROM public.ai_job_attempts
    WHERE job_id = j.id
    ORDER BY started_at DESC
    LIMIT 1
  ) a ON true
  WHERE j.id = _job_id
    AND j.user_id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.get_ai_job_safe_status(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_ai_job_safe_status(uuid) TO authenticated, service_role;

-- ─── 5. Атомарный старт fallback ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.begin_ai_fallback(_job_id uuid, _actor_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job   public.ai_jobs;
  v_role  text := current_setting('request.jwt.claim.role', true);
  v_caller uuid := auth.uid();
  v_existing public.ai_job_attempts;
  v_next_n int;
  v_attempt_id uuid;
BEGIN
  -- Блокируем строку задачи на время транзакции.
  SELECT * INTO v_job FROM public.ai_jobs WHERE id = _job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RAISE EXCEPTION 'job_not_found' USING ERRCODE = 'no_data_found';
  END IF;

  -- Авторизация: либо service_role (edge-функция уже проверила кандидата
  -- по token), либо владелец задачи (employer).
  IF v_role <> 'service_role' THEN
    IF v_caller IS NULL OR v_caller IS DISTINCT FROM v_job.user_id THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_job.fallback_allowed THEN
    RAISE EXCEPTION 'fallback_not_allowed' USING ERRCODE = 'check_violation';
  END IF;
  IF v_job.fallback_used THEN
    -- Идемпотентность: возвращаем существующую активную попытку, если есть.
    SELECT * INTO v_existing
      FROM public.ai_job_attempts
      WHERE job_id = _job_id AND provider = 'rr_pro_max'
      ORDER BY attempt_number DESC LIMIT 1;
    RETURN jsonb_build_object(
      'ok', true, 'already', true,
      'attempt_id', v_existing.id,
      'attempt_status', v_existing.status,
      'job_status', v_job.status
    );
  END IF;
  IF v_job.status <> 'primary_failed' AND v_job.status <> 'fallback_available' THEN
    RAISE EXCEPTION 'illegal_state_for_fallback' USING ERRCODE = 'check_violation';
  END IF;

  -- Помечаем использование резерва и переводим в fallback_restarting.
  UPDATE public.ai_jobs
     SET fallback_used = true,
         status = 'fallback_restarting',
         updated_at = now()
   WHERE id = _job_id;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_next_n
    FROM public.ai_job_attempts
   WHERE job_id = _job_id AND provider = 'rr_pro_max';

  INSERT INTO public.ai_job_attempts (job_id, provider, attempt_number, status)
  VALUES (_job_id, 'rr_pro_max', v_next_n, 'started')
  RETURNING id INTO v_attempt_id;

  RETURN jsonb_build_object(
    'ok', true, 'already', false,
    'attempt_id', v_attempt_id,
    'attempt_number', v_next_n
  );
END $$;

REVOKE ALL ON FUNCTION public.begin_ai_fallback(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_ai_fallback(uuid, uuid) TO service_role;