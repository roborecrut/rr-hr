-- Phase 3B-2B Step B: crash-safe storage of checklist answers for v2 grading.
-- Additive only. v1 flow (ai-interview-grade-checklist) is untouched.

CREATE TABLE IF NOT EXISTS public.candidate_checklist_answers_v2 (
  candidate_id uuid PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id   uuid NOT NULL,
  answers      jsonb NOT NULL DEFAULT '{}'::jsonb,
  answers_hash text NOT NULL DEFAULT '',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.candidate_checklist_answers_v2 TO service_role;
-- intentionally NO grants to anon/authenticated; only service_role-backed
-- edge functions access this table after candidate-token verification.

ALTER TABLE public.candidate_checklist_answers_v2 ENABLE ROW LEVEL SECURITY;
-- No policies → effectively denied for anon/authenticated. service_role
-- bypasses RLS.

CREATE OR REPLACE FUNCTION public.save_checklist_answers_v2(
  _candidate uuid,
  _project   uuid,
  _answers   jsonb,
  _answers_hash text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF _candidate IS NULL OR _project IS NULL THEN RAISE EXCEPTION 'no_ids'; END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'object' THEN RAISE EXCEPTION 'bad_answers'; END IF;
  IF _answers_hash IS NULL OR length(_answers_hash) < 16 THEN RAISE EXCEPTION 'bad_hash'; END IF;

  INSERT INTO public.candidate_checklist_answers_v2
    (candidate_id, project_id, answers, answers_hash, updated_at)
  VALUES
    (_candidate, _project, _answers, _answers_hash, v_now)
  ON CONFLICT (candidate_id) DO UPDATE SET
    project_id   = EXCLUDED.project_id,
    answers      = EXCLUDED.answers,
    answers_hash = EXCLUDED.answers_hash,
    updated_at   = v_now;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'answers_hash', _answers_hash,
    'updated_at', v_now
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION public.save_checklist_answers_v2(uuid,uuid,jsonb,text) TO service_role;