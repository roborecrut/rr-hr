-- 1) Унифицируем хеш резюме на sha256 (встроенная функция Postgres 11+,
--    pgcrypto не требуется). Раньше DB-RPC писал md5, а edge-функция
--    `ai-interview-screen-resume-v2` сравнивала с sha256 → каждое первое
--    же сравнение давало «resume_version_changed» и задача не доходила до
--    нейросети.
CREATE OR REPLACE FUNCTION public.save_candidate_resume_text(
  _candidate uuid,
  _resume_text text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clean text;
  v_hash text;
  v_now timestamptz := now();
BEGIN
  IF _candidate IS NULL THEN RAISE EXCEPTION 'no_candidate'; END IF;
  IF _resume_text IS NULL THEN RAISE EXCEPTION 'no_resume_text'; END IF;
  v_clean := LEFT(btrim(_resume_text), 20000);
  IF length(v_clean) < 50 THEN RAISE EXCEPTION 'resume_too_short'; END IF;
  -- встроенный pg_catalog.sha256 — без расширений, совместим с sha256Hex воркера.
  v_hash := encode(sha256(convert_to(v_clean, 'UTF8')), 'hex');

  UPDATE public.candidates
     SET resume_text       = v_clean,
         resume_hash       = v_hash,
         resume_updated_at = v_now
   WHERE id = _candidate;
  IF NOT FOUND THEN RAISE EXCEPTION 'candidate_not_found'; END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'resume_hash', v_hash,
    'resume_updated_at', v_now
  );
END;
$$;

-- 2) Пересчитать все ранее сохранённые md5-хеши в sha256, иначе у
--    существующих кандидатов «снимок» (md5) и пересчёт воркером (sha256)
--    разойдутся и анализ снова не запустится.
UPDATE public.candidates
   SET resume_hash = encode(sha256(convert_to(LEFT(btrim(resume_text), 20000), 'UTF8')), 'hex')
 WHERE resume_text IS NOT NULL
   AND length(btrim(resume_text)) >= 50;

-- 3) Разрешаем переход created → validation_failed/save_failed/timed_out.
--    Сейчас триггер `ai_jobs_guard` блокирует эти переходы, поэтому ранние
--    ошибки входных данных не отмечались как терминальные и оставляли
--    задачу в `created` до reaper'а (8 минут «как будто работает»). Также
--    легализуем fallback_unavailable как разрешённое терминальное.
ALTER TYPE public.ai_job_status ADD VALUE IF NOT EXISTS 'fallback_unavailable';

CREATE OR REPLACE FUNCTION public.tg_ai_jobs_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_allowed text[];
BEGIN
  IF OLD.fallback_used = true AND NEW.fallback_used = false THEN
    RAISE EXCEPTION 'ai_jobs_guard: fallback_used cannot be reset' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.credits_status = 'charged' AND NEW.credits_status = 'not_charged' THEN
    RAISE EXCEPTION 'ai_jobs_guard: credits_status cannot be reset to not_charged' USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.credits_idem_key IS NOT NULL AND NEW.credits_idem_key IS DISTINCT FROM OLD.credits_idem_key THEN
    RAISE EXCEPTION 'ai_jobs_guard: credits_idem_key is immutable' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'ai_jobs_guard: idempotency_key is immutable' USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_allowed := CASE OLD.status::text
      WHEN 'created'             THEN ARRAY['primary_running','cancelled','validation_failed','save_failed','timed_out','orchestration_failed']
      WHEN 'primary_running'     THEN ARRAY['primary_succeeded','primary_failed','timed_out','cancelled','validation_failed','save_failed','orchestration_failed']
      WHEN 'primary_succeeded'   THEN ARRAY[]::text[]
      WHEN 'primary_failed'      THEN ARRAY['fallback_available','fallback_unavailable','cancelled','orchestration_failed']
      WHEN 'fallback_available'  THEN ARRAY['fallback_restarting','fallback_running','fallback_unavailable','cancelled','orchestration_failed']
      WHEN 'fallback_restarting' THEN ARRAY['fallback_running','fallback_failed','fallback_unavailable','cancelled','timed_out','orchestration_failed']
      WHEN 'fallback_running'    THEN ARRAY['fallback_succeeded','fallback_failed','timed_out','cancelled','validation_failed','save_failed','orchestration_failed']
      WHEN 'fallback_succeeded'   THEN ARRAY[]::text[]
      WHEN 'fallback_failed'      THEN ARRAY[]::text[]
      WHEN 'fallback_unavailable' THEN ARRAY[]::text[]
      WHEN 'cancelled'            THEN ARRAY[]::text[]
      WHEN 'timed_out'            THEN ARRAY[]::text[]
      WHEN 'save_failed'          THEN ARRAY[]::text[]
      WHEN 'validation_failed'    THEN ARRAY[]::text[]
      WHEN 'orchestration_failed' THEN ARRAY[]::text[]
      ELSE ARRAY[]::text[]
    END;
    IF NOT (NEW.status::text = ANY (v_allowed)) THEN
      RAISE EXCEPTION 'ai_jobs_guard: illegal transition % → %', OLD.status, NEW.status USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END $function$;

-- 4) Закрыть зависшие задачи скрининга резюме, чтобы фронт не пытался
--    к ним «прицепиться» при повторе. На клиенте уже есть автоочистка
--    устаревших pointer'ов, но эта строка гарантирует, что в БД не
--    останутся «полу-задачи» от предыдущей md5-эпохи.
UPDATE public.ai_jobs
   SET status = 'orchestration_failed',
       completed_at = COALESCE(completed_at, now()),
       updated_at = now()
 WHERE job_type = 'screen_resume_v2'
   AND status::text IN ('created','primary_running','fallback_running','primary_failed','fallback_available');