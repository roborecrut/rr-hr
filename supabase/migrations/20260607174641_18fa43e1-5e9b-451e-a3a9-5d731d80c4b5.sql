create extension if not exists pg_trgm;

alter table public.projects
  add column if not exists search_tsv tsvector;

create or replace function public.projects_search_tsv_update()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  company_name text;
begin
  select c.name into company_name from public.companies c where c.id = new.company_id;
  new.search_tsv :=
    setweight(to_tsvector('russian', coalesce(new.role_name, '')), 'A') ||
    setweight(to_tsvector('russian', coalesce(company_name, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(new.salary_terms, '')), 'B') ||
    setweight(to_tsvector('russian', coalesce(new.schedule_terms, '')), 'C') ||
    setweight(to_tsvector('russian', coalesce(new.vacancy_text, '')), 'D');
  return new;
end;
$$;

drop trigger if exists projects_search_tsv_trg on public.projects;
create trigger projects_search_tsv_trg
before insert or update of role_name, salary_terms, schedule_terms, vacancy_text, company_id
on public.projects
for each row execute function public.projects_search_tsv_update();

-- backfill existing rows
update public.projects p
set search_tsv =
  setweight(to_tsvector('russian', coalesce(p.role_name, '')), 'A') ||
  setweight(to_tsvector('russian', coalesce((select c.name from public.companies c where c.id = p.company_id), '')), 'B') ||
  setweight(to_tsvector('russian', coalesce(p.salary_terms, '')), 'B') ||
  setweight(to_tsvector('russian', coalesce(p.schedule_terms, '')), 'C') ||
  setweight(to_tsvector('russian', coalesce(p.vacancy_text, '')), 'D');

create index if not exists projects_search_tsv_idx on public.projects using gin (search_tsv);
create index if not exists projects_role_trgm_idx on public.projects using gin (role_name gin_trgm_ops);

create or replace function public.search_vacancies(
  q text,
  match_count int default 50
)
returns table (id uuid, rank real)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  tsq tsquery;
begin
  if q is null or length(btrim(q)) = 0 then
    return query
      select p.id, 0::real as rank
      from public.projects p
      where p.is_published = true and p.status = 'active'
      order by p.created_at desc
      limit match_count;
    return;
  end if;

  tsq := websearch_to_tsquery('russian', q);

  return query
    select p.id,
           (
             ts_rank(p.search_tsv, tsq) * 4.0
             + similarity(coalesce(p.role_name, ''), q) * 2.0
             + similarity(coalesce((select c.name from public.companies c where c.id = p.company_id), ''), q)
           )::real as rank
    from public.projects p
    where p.is_published = true
      and p.status = 'active'
      and (
        p.search_tsv @@ tsq
        or coalesce(p.role_name, '') % q
        or coalesce((select c.name from public.companies c where c.id = p.company_id), '') % q
      )
    order by rank desc
    limit match_count;
end;
$$;

grant execute on function public.search_vacancies(text, int) to anon, authenticated, service_role;