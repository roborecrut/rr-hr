
-- 1) Table
CREATE TABLE IF NOT EXISTS public.candidate_situations_answers_v2 (
  candidate_id  uuid        NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id    uuid        NOT NULL REFERENCES public.projects(id)   ON DELETE CASCADE,
  answers       jsonb       NOT NULL,
  answers_hash  text        NOT NULL,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (candidate_id, project_id)
);

-- 2) Grants — strictly server-only.
REVOKE ALL ON public.candidate_situations_answers_v2 FROM PUBLIC;
REVOKE ALL ON public.candidate_situations_answers_v2 FROM anon;
REVOKE ALL ON public.candidate_situations_answers_v2 FROM authenticated;
GRANT  ALL ON public.candidate_situations_answers_v2 TO service_role;

-- 3) RLS — enabled with no policies (anon/authenticated have no access).
ALTER TABLE public.candidate_situations_answers_v2 ENABLE ROW LEVEL SECURITY;

-- 4) Atomic upsert RPC.
CREATE OR REPLACE FUNCTION public.save_situations_answers_v2(
  _candidate     uuid,
  _project       uuid,
  _answers       jsonb,
  _answers_hash  text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_now timestamptz := now();
BEGIN
  IF _candidate IS NULL OR _project IS NULL THEN RAISE EXCEPTION 'no_ids'; END IF;
  IF _answers IS NULL OR jsonb_typeof(_answers) <> 'object' THEN RAISE EXCEPTION 'bad_answers'; END IF;
  IF _answers_hash IS NULL OR length(_answers_hash) < 16 THEN RAISE EXCEPTION 'bad_hash'; END IF;

  INSERT INTO public.candidate_situations_answers_v2
    (candidate_id, project_id, answers, answers_hash, updated_at)
  VALUES
    (_candidate, _project, _answers, _answers_hash, v_now)
  ON CONFLICT (candidate_id, project_id) DO UPDATE SET
    answers      = EXCLUDED.answers,
    answers_hash = EXCLUDED.answers_hash,
    updated_at   = v_now;

  RETURN jsonb_build_object(
    'ok', true,
    'candidate_id', _candidate,
    'project_id',  _project,
    'answers_hash', _answers_hash,
    'updated_at',  v_now
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.save_situations_answers_v2(uuid, uuid, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_situations_answers_v2(uuid, uuid, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.save_situations_answers_v2(uuid, uuid, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.save_situations_answers_v2(uuid, uuid, jsonb, text) TO service_role;
