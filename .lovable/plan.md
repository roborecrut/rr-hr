
## 1. Company landing — sync sections with DB fields

**Goal:** `/com{public_id}` renders one section per filled company field, with the logo from `companies.logo_url`, and lets the visitor pick any published vacancy of the company.

Files: `src/pages/CompanyLanding.tsx`, `src/components/VacancySections.tsx` (only if a new presenter is needed).

- Load company by `slug` (already done) and **all** its published projects.
- When the URL is `/com{slug}` (no `/vac...`), render a **company-only** view:
  - Header: logo from `companies.logo_url` (fallback to placeholder only if empty). Remove the "Войти" button from the header completely.
  - Sections built strictly from filled `companies.*` fields (skip a section when the field is empty). One section per field, in this fixed order, with exact headings from the master:
    1. О компании — `description_text`
    2. Продукты — `products_text`
    3. Миссия — `mission_text`
    4. О нас — `about_text`
    5. Команда — `team_text`
    6. Выплаты — `payouts_text`
    7. График — `schedule_text`
    8. ИИ-Система — `system_text`
    9. Показатели — `stats` (render only keys present in JSON).
  - **Vacancy picker block**: a grid of cards for every published project of the company (`role_name`, `salary_terms`, `schedule_terms`, logo). Click → `/com{slug}/vac{slug}`.
- When `/com{slug}/vac{slug}` is open: keep the current vacancy tabs view, but the header still shows the company logo from `companies.logo_url` (not the project logo) and shows the company name.
- Remove the header "Войти" button on every `/com...` route. The candidate login modal must be triggerable **only from a vacancy page** (the existing CTA inside the vacancy view).

## 2. Candidate auth — email + password only, scoped to a vacancy

**Goal:** Employers continue to use Google (Supabase Auth). Candidates use a separate email/password flow whose record lives in `public.candidates` and is bound to the project + company they registered from.

### 2.1 DB migration (`supabase/migrations/...`)

Add to `public.candidates`:
- `email text` (nullable, unique partial index where not null)
- `password_hash text`
- `company_id uuid references public.companies(id)`
- `auth_kind text default 'email'` (`'email' | 'google' | 'telegram'`)
- `last_login_at timestamptz`

Add helper RPCs (SECURITY DEFINER, `search_path=public`) so the anon client never touches the password column directly:

- `candidate_email_signup(_email text, _password text, _project uuid, _company uuid)` → validates email format, password length ≥ 8, hashes with `crypt(_password, gen_salt('bf'))` (enable `pgcrypto` if missing), inserts a candidate row bound to project + company, returns `{ candidate_id, public_id, token }` where `token` is a random `gen_random_uuid()` stored in a new `candidate_sessions` table.
- `candidate_email_login(_email text, _password text)` → verifies hash with `crypt`, returns the same shape.
- New table `candidate_sessions(token uuid pk, candidate_id uuid, created_at, expires_at)` with `GRANT SELECT, INSERT, DELETE … TO authenticated, anon` only via the RPCs (no direct grants on the table beyond `service_role`).
- RLS: candidate rows already restrict updates; add a policy so `candidates.password_hash` is never selectable by `anon`/`authenticated` (use a view `candidates_public` that excludes it, and revoke column privileges on `password_hash`).

### 2.2 Frontend changes

Files: `src/pages/CompanyLanding.tsx`, new `src/components/CandidateAuthModal.tsx`, `src/lib/candidateSession.ts`, `src/pages/CandidateFlow.tsx`.

- Replace the current 1-click Google/Telegram modal on the vacancy page with a new `CandidateAuthModal` containing two tabs (Регистрация / Вход):
  - **Регистрация:** email (regex check), пароль (≥8), повтор пароля (должны совпадать). No email confirmation sent. On submit → `supabase.rpc('candidate_email_signup', { _email, _password, _project: project.id, _company: company.id })`.
  - **Вход:** email + пароль → `candidate_email_login`.
- On success: save `{ token, candidate_id, public_id }` to `localStorage` under `cand_session` and navigate to `/com{companySlug}/vac{vacSlug}/cand{public_id}/profile` (candidate profile bound to the vacancy).
- `CandidateFlow` reads `cand_session` instead of the previous `cand_session_id` and loads its candidate by `public_id`.
- Remove the old Google/Telegram one-click code path on the candidate side.

### 2.3 Employer CRM visibility

The employer's existing candidate list already queries `candidates` filtered by their projects — no extra work needed. The new `company_id` + `project_id` columns make the per-vacancy / per-company grouping straightforward; ensure the employer dashboard query selects `email` and `auth_kind` so registered candidates are visible immediately.

## 3. Cleanup

- Drop `AuthModal` usage on `/com...` routes.
- Update `AIDialogPanel` / header copy where it currently references "Войти" on company pages.

## Technical notes

- `pgcrypto` is needed for `crypt` + `gen_salt('bf')`. The migration will `CREATE EXTENSION IF NOT EXISTS pgcrypto`.
- Password hash never crosses the network; only RPCs see plaintext, briefly.
- All new RPCs return `jsonb` with `{ ok, error }` shape so the client can display "email занят" / "неверный пароль" without leaking which one failed (login returns generic "неверные данные").
- No edits to existing migrations; one new timestamped migration file.
- No changes to ProTalk / ai-* edge functions in this plan.
