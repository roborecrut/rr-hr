-- Idempotently grant admin role to the founding admin email if that user already exists.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'admin'::public.app_role
FROM auth.users u
WHERE lower(u.email) = 'shishkarnem@gmail.com'
ON CONFLICT DO NOTHING;