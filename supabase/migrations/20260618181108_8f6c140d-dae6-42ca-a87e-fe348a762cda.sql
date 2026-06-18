REVOKE EXECUTE ON FUNCTION public._test_advance_stage_v2_run() FROM PUBLIC, authenticated, anon;
GRANT  EXECUTE ON FUNCTION public._test_advance_stage_v2_run() TO service_role;