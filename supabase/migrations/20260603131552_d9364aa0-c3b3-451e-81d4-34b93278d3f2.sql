
-- ============ COMPANY PAGES ============
CREATE TABLE public.company_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  page_key TEXT NOT NULL,
  title TEXT,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, page_key)
);
GRANT SELECT ON public.company_pages TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.company_pages TO authenticated;
GRANT ALL ON public.company_pages TO service_role;
ALTER TABLE public.company_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cp public read" ON public.company_pages FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND c.is_published = true)
);
CREATE POLICY "cp auth read" ON public.company_pages FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.companies c WHERE c.id = company_id AND (c.is_published = true OR EXISTS (SELECT 1 FROM public.employers e WHERE e.id = c.owner_employer_id AND e.user_id = auth.uid()) OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "cp write owner" ON public.company_pages FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.companies c JOIN public.employers e ON e.id = c.owner_employer_id WHERE c.id = company_id AND (e.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.companies c JOIN public.employers e ON e.id = c.owner_employer_id WHERE c.id = company_id AND (e.user_id = auth.uid() OR public.has_role(auth.uid(),'admin'))));
CREATE TRIGGER trg_cp_updated BEFORE UPDATE ON public.company_pages FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============ CRM NOTES ============
CREATE TABLE public.crm_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id),
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_notes TO authenticated;
GRANT ALL ON public.crm_notes TO service_role;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notes employer rw" ON public.crm_notes FOR ALL TO authenticated USING (
  EXISTS (SELECT 1 FROM public.candidates c JOIN public.projects p ON p.id = c.project_id JOIN public.employers e ON e.id = p.employer_id WHERE c.id = candidate_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.candidates c JOIN public.projects p ON p.id = c.project_id JOIN public.employers e ON e.id = p.employer_id WHERE c.id = candidate_id AND e.user_id = auth.uid())
  OR public.has_role(auth.uid(),'admin')
);
CREATE INDEX idx_notes_cand ON public.crm_notes(candidate_id);

-- ============ RECRUITER <-> CANDIDATE MESSAGES ============
CREATE TABLE public.messages_recruiter (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id UUID NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
  sender public.message_sender NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.messages_recruiter TO authenticated;
GRANT ALL ON public.messages_recruiter TO service_role;
ALTER TABLE public.messages_recruiter ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mr select" ON public.messages_recruiter FOR SELECT TO authenticated USING (public.can_view_candidate(candidate_id));
CREATE POLICY "mr insert" ON public.messages_recruiter FOR INSERT TO authenticated WITH CHECK (public.can_view_candidate(candidate_id));
CREATE INDEX idx_mr_cand ON public.messages_recruiter(candidate_id, created_at);

-- ============ TELEGRAM LOGS ============
CREATE TABLE public.telegram_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  direction public.tg_direction NOT NULL,
  chat_id BIGINT,
  user_id UUID REFERENCES auth.users(id),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  employer_id UUID REFERENCES public.employers(id) ON DELETE SET NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.telegram_logs TO authenticated;
GRANT ALL ON public.telegram_logs TO service_role;
ALTER TABLE public.telegram_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tg_logs admin select" ON public.telegram_logs FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin') OR user_id = auth.uid()
  OR (employer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employers e WHERE e.id = employer_id AND e.user_id = auth.uid()))
);
CREATE INDEX idx_tglogs_created ON public.telegram_logs(created_at DESC);

-- ============ AI RUNS ============
CREATE TABLE public.ai_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  endpoint TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  candidate_id UUID REFERENCES public.candidates(id) ON DELETE SET NULL,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  employer_id UUID REFERENCES public.employers(id) ON DELETE SET NULL,
  model TEXT,
  input JSONB,
  output JSONB,
  tokens_in INT,
  tokens_out INT,
  cost_rr NUMERIC(12,4),
  status TEXT DEFAULT 'ok',
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ai_runs TO authenticated;
GRANT ALL ON public.ai_runs TO service_role;
ALTER TABLE public.ai_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_runs admin" ON public.ai_runs FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(),'admin')
  OR user_id = auth.uid()
  OR (employer_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employers e WHERE e.id = employer_id AND e.user_id = auth.uid()))
);
CREATE INDEX idx_ai_runs_created ON public.ai_runs(created_at DESC);

-- ============ ASSISTANT CHATS ============
CREATE TABLE public.assistant_chats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,           -- 'employer' | 'candidate' | 'vacancy_consultant'
  scope_id UUID,                -- e.g. project_id
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_chats TO authenticated;
GRANT ALL ON public.assistant_chats TO service_role;
ALTER TABLE public.assistant_chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ac self" ON public.assistant_chats FOR ALL TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin')) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER trg_ac_updated BEFORE UPDATE ON public.assistant_chats FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_ac_user ON public.assistant_chats(user_id, kind);

-- ============ REFERRALS ============
CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_code TEXT NOT NULL UNIQUE,
  owner_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  used_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reward_rr NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  redeemed_at TIMESTAMPTZ
);
GRANT SELECT ON public.referrals TO anon;
GRANT SELECT, INSERT, UPDATE ON public.referrals TO authenticated;
GRANT ALL ON public.referrals TO service_role;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ref public lookup by code" ON public.referrals FOR SELECT TO anon USING (true);
CREATE POLICY "ref owner select" ON public.referrals FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "ref owner insert" ON public.referrals FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());

-- ============ AUDIT LOG ============
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  target_table TEXT,
  target_id UUID,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit admin select" ON public.audit_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_audit_created ON public.audit_log(created_at DESC);
