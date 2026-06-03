
-- helper: caller is owner of project
CREATE OR REPLACE FUNCTION public.is_project_owner(_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects p
    JOIN public.employers e ON e.id = p.employer_id
    WHERE p.id = _project AND e.user_id = auth.uid()
  )
$$;
REVOKE ALL ON FUNCTION public.is_project_owner(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_project_owner(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_project_published(_project UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects p WHERE p.id = _project AND p.is_published = true)
$$;
REVOKE ALL ON FUNCTION public.is_project_published(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_project_published(uuid) TO anon, authenticated, service_role;

-- ============ PROJECT QUESTIONS ============
CREATE TABLE public.project_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category public.question_category NOT NULL,
  order_index INT NOT NULL DEFAULT 0,
  type public.quiz_type NOT NULL DEFAULT 'select',
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT,
  explanation TEXT,
  material_title TEXT,
  material_content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_questions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_questions TO authenticated;
GRANT ALL ON public.project_questions TO service_role;
ALTER TABLE public.project_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pq read published" ON public.project_questions FOR SELECT TO anon USING (public.is_project_published(project_id));
CREATE POLICY "pq read auth" ON public.project_questions FOR SELECT TO authenticated USING (public.is_project_published(project_id) OR public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "pq write owner" ON public.project_questions FOR ALL TO authenticated USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_pq_project_cat ON public.project_questions(project_id, category, order_index);

-- ============ CHECKLIST & ROLEPLAY ITEMS ============
CREATE TABLE public.project_checklist_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_checklist_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_checklist_items TO authenticated;
GRANT ALL ON public.project_checklist_items TO service_role;
ALTER TABLE public.project_checklist_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pci read pub" ON public.project_checklist_items FOR SELECT TO anon USING (public.is_project_published(project_id));
CREATE POLICY "pci read auth" ON public.project_checklist_items FOR SELECT TO authenticated USING (public.is_project_published(project_id) OR public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "pci write owner" ON public.project_checklist_items FOR ALL TO authenticated USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_pci_project ON public.project_checklist_items(project_id, order_index);

CREATE TABLE public.project_roleplay_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  order_index INT NOT NULL DEFAULT 0,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.project_roleplay_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_roleplay_items TO authenticated;
GRANT ALL ON public.project_roleplay_items TO service_role;
ALTER TABLE public.project_roleplay_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pri read pub" ON public.project_roleplay_items FOR SELECT TO anon USING (public.is_project_published(project_id));
CREATE POLICY "pri read auth" ON public.project_roleplay_items FOR SELECT TO authenticated USING (public.is_project_published(project_id) OR public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "pri write owner" ON public.project_roleplay_items FOR ALL TO authenticated USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_pri_project ON public.project_roleplay_items(project_id, order_index);

-- ============ TRAINING BLOCKS / LESSONS / QUIZZES ============
CREATE TABLE public.training_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.training_blocks TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_blocks TO authenticated;
GRANT ALL ON public.training_blocks TO service_role;
ALTER TABLE public.training_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tb read pub" ON public.training_blocks FOR SELECT TO anon USING (public.is_project_published(project_id));
CREATE POLICY "tb read auth" ON public.training_blocks FOR SELECT TO authenticated USING (public.is_project_published(project_id) OR public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "tb write owner" ON public.training_blocks FOR ALL TO authenticated USING (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_project_owner(project_id) OR public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_tb_project ON public.training_blocks(project_id, order_index);

CREATE TABLE public.training_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id UUID NOT NULL REFERENCES public.training_blocks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.training_lessons TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_lessons TO authenticated;
GRANT ALL ON public.training_lessons TO service_role;
ALTER TABLE public.training_lessons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tl read pub" ON public.training_lessons FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM public.training_blocks b WHERE b.id = block_id AND public.is_project_published(b.project_id))
);
CREATE POLICY "tl read auth" ON public.training_lessons FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.training_blocks b WHERE b.id = block_id AND (public.is_project_published(b.project_id) OR public.is_project_owner(b.project_id) OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "tl write owner" ON public.training_lessons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_blocks b WHERE b.id = block_id AND (public.is_project_owner(b.project_id) OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_blocks b WHERE b.id = block_id AND (public.is_project_owner(b.project_id) OR public.has_role(auth.uid(),'admin'))));
CREATE INDEX idx_tl_block ON public.training_lessons(block_id, order_index);

CREATE TABLE public.training_quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id UUID NOT NULL REFERENCES public.training_lessons(id) ON DELETE CASCADE,
  type public.quiz_type NOT NULL DEFAULT 'select',
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  correct_answer TEXT,
  explanation TEXT,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.training_quizzes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_quizzes TO authenticated;
GRANT ALL ON public.training_quizzes TO service_role;
ALTER TABLE public.training_quizzes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tq read pub" ON public.training_quizzes FOR SELECT TO anon USING (
  EXISTS (SELECT 1 FROM public.training_lessons l JOIN public.training_blocks b ON b.id = l.block_id WHERE l.id = lesson_id AND public.is_project_published(b.project_id))
);
CREATE POLICY "tq read auth" ON public.training_quizzes FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.training_lessons l JOIN public.training_blocks b ON b.id = l.block_id WHERE l.id = lesson_id AND (public.is_project_published(b.project_id) OR public.is_project_owner(b.project_id) OR public.has_role(auth.uid(),'admin')))
);
CREATE POLICY "tq write owner" ON public.training_quizzes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.training_lessons l JOIN public.training_blocks b ON b.id = l.block_id WHERE l.id = lesson_id AND (public.is_project_owner(b.project_id) OR public.has_role(auth.uid(),'admin'))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.training_lessons l JOIN public.training_blocks b ON b.id = l.block_id WHERE l.id = lesson_id AND (public.is_project_owner(b.project_id) OR public.has_role(auth.uid(),'admin'))));
CREATE INDEX idx_tq_lesson ON public.training_quizzes(lesson_id, order_index);
