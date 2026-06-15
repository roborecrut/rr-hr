-- candidates.password_hash: read только service_role
REVOKE SELECT (password_hash) ON public.candidates FROM PUBLIC;
REVOKE SELECT (password_hash) ON public.candidates FROM anon;
REVOKE SELECT (password_hash) ON public.candidates FROM authenticated;

-- job_titles.interview_template: read только service_role; доступ для UI через RPC job_title_get_interview_template (SECURITY DEFINER)
REVOKE SELECT (interview_template) ON public.job_titles FROM PUBLIC;
REVOKE SELECT (interview_template) ON public.job_titles FROM anon;
REVOKE SELECT (interview_template) ON public.job_titles FROM authenticated;