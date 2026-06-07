-- Откатываем добавленный ранее полнотекстовый поиск по вакансиям —
-- умный поиск выпиливаем из продукта по требованию пользователя.
drop function if exists public.search_vacancies(text, int);
drop trigger if exists projects_search_tsv_trg on public.projects;
drop function if exists public.projects_search_tsv_update();
drop index if exists public.projects_search_tsv_idx;
drop index if exists public.projects_role_trgm_idx;
alter table public.projects drop column if exists search_tsv;
