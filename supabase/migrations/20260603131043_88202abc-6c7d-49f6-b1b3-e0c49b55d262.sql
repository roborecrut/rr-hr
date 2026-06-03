
-- helper: caller "owns" this candidate (либо это сам кандидат, либо работодатель его вакансии)
CREATE OR REPLACE FUNCTION public.can_view_candidate(_candidate UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.candidates c
    WHERE c.id = _candidate AND (
      c.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM public.projects p JOIN public.employers e ON e.id = p.employer_id WHERE p.id = c.project_id AND e.user_id = auth.uid())
      OR public.has_role(auth.uid(),'admin')
    )
  )
$$;
REVOKE ALL ON FUNCTION public.can_view_candidate(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_candidate(uuid) TO authenticated, service_role;

-- ============ STAGES HISTORY ============
CREATE TABLE public.candidate_stages_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  from_stage public.candidate_stage,
  to_stage public.candidate_stage NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.candidate_stages_history TO authenticated;
GRANT ALL ON public.candidate_stages_history TO service_role;
ALTER TABLE public.candidate_stages_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "csh select" ON public.candidate_stages_history FOR SELECT TO authenticated USING (public.can_view_candidate(candidate_id));
CREATE POLICY "csh insert" ON public.candidate_stages_history FOR INSERT TO authenticated WITH CHECK (public.can_view_candidate(candidate_id));
CREATE INDEX idx_csh_cand ON public.candidate_stages_history(candidate_id);

-- ============ INTERVIEWS ============
CREATE TABLE public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress',
  transcript_text TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.interviews TO authenticated;
GRANT ALL ON public.interviews TO service_role;
ALTER TABLE public.interviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "iv select" ON public.interviews FOR SELECT TO authenticated USING (public.can_view_candidate(candidate_id));
CREATE POLICY "iv write" ON public.interviews FOR ALL TO authenticated USING (public.can_view_candidate(candidate_id)) WITH CHECK (public.can_view_candidate(candidate_id));
CREATE TRIGGER trg_iv_updated BEFORE UPDATE ON public.interviews FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_iv_cand ON public.interviews(candidate_id);

-- ============ INTERVIEW MESSAGES ============
CREATE TABLE public.interview_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES public.interviews(id) ON DELETE CASCADE,
  sender public.message_sender NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.interview_messages TO authenticated;
GRANT ALL ON public.interview_messages TO service_role;
ALTER TABLE public.interview_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ivm select" ON public.interview_messages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND public.can_view_candidate(i.candidate_id))
);
CREATE POLICY "ivm insert" ON public.interview_messages FOR INSERT TO authenticated WITH CHECK (
  EXISTS (SELECT 1 FROM public.interviews i WHERE i.id = interview_id AND public.can_view_candidate(i.candidate_id))
);
CREATE INDEX idx_ivm_int ON public.interview_messages(interview_id);

-- ============ CANDIDATE ANSWERS ============
CREATE TABLE public.candidate_answers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  question_id UUID NOT NULL REFERENCES public.project_questions(id) ON DELETE CASCADE,
  answer_text TEXT,
  is_correct BOOLEAN,
  score NUMERIC(6,2),
  feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, question_id)
);
GRANT SELECT, INSERT, UPDATE ON public.candidate_answers TO authenticated;
GRANT ALL ON public.candidate_answers TO service_role;
ALTER TABLE public.candidate_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ca select" ON public.candidate_answers FOR SELECT TO authenticated USING (public.can_view_candidate(candidate_id));
CREATE POLICY "ca write" ON public.candidate_answers FOR ALL TO authenticated USING (public.can_view_candidate(candidate_id)) WITH CHECK (public.can_view_candidate(candidate_id));
CREATE INDEX idx_ca_cand ON public.candidate_answers(candidate_id);

-- ============ CANDIDATE SCORES ============
CREATE TABLE public.candidate_scores (
  candidate_id UUID PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
  interview_score NUMERIC(5,2) DEFAULT 0,
  resume_score NUMERIC(5,2) DEFAULT 0,
  checklist_points INT DEFAULT 0,
  roleplay_points INT DEFAULT 0,
  overall_score NUMERIC(5,2) DEFAULT 0,
  checklist_score NUMERIC(5,2) DEFAULT 0,
  checklist_sys_score NUMERIC(5,2) DEFAULT 0,
  situations_score NUMERIC(5,2) DEFAULT 0,
  assessment_summary TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.candidate_scores TO authenticated;
GRANT ALL ON public.candidate_scores TO service_role;
ALTER TABLE public.candidate_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cs select" ON public.candidate_scores FOR SELECT TO authenticated USING (public.can_view_candidate(candidate_id));
CREATE POLICY "cs write" ON public.candidate_scores FOR ALL TO authenticated USING (public.can_view_candidate(candidate_id)) WITH CHECK (public.can_view_candidate(candidate_id));
CREATE TRIGGER trg_cs_updated BEFORE UPDATE ON public.candidate_scores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ TRAINING PROGRESS ============
CREATE TABLE public.candidate_training_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.training_lessons(id) ON DELETE CASCADE,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  score NUMERIC(5,2),
  quiz_feedback TEXT,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (candidate_id, lesson_id)
);
GRANT SELECT, INSERT, UPDATE ON public.candidate_training_progress TO authenticated;
GRANT ALL ON public.candidate_training_progress TO service_role;
ALTER TABLE public.candidate_training_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ctp select" ON public.candidate_training_progress FOR SELECT TO authenticated USING (public.can_view_candidate(candidate_id));
CREATE POLICY "ctp write" ON public.candidate_training_progress FOR ALL TO authenticated USING (public.can_view_candidate(candidate_id)) WITH CHECK (public.can_view_candidate(candidate_id));
CREATE INDEX idx_ctp_cand ON public.candidate_training_progress(candidate_id);

-- ============ CERTIFICATIONS ============
CREATE TABLE public.certifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  certificate_url TEXT,
  meta JSONB DEFAULT '{}'::jsonb
);
GRANT SELECT, INSERT ON public.certifications TO authenticated;
GRANT ALL ON public.certifications TO service_role;
ALTER TABLE public.certifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cert select" ON public.certifications FOR SELECT TO authenticated USING (public.can_view_candidate(candidate_id));
CREATE POLICY "cert insert" ON public.certifications FOR INSERT TO authenticated WITH CHECK (public.can_view_candidate(candidate_id));
CREATE INDEX idx_cert_cand ON public.certifications(candidate_id);
