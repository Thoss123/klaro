-- Safe view for client reads: excludes encrypted credential payloads.

CREATE OR REPLACE VIEW public.user_credentials_safe AS
SELECT
  id,
  user_id,
  project_id,
  tool_name,
  credential_type,
  status,
  n8n_credential_id,
  created_at,
  updated_at
FROM public.user_credentials;

ALTER VIEW public.user_credentials_safe SET (security_invoker = true);

GRANT SELECT ON public.user_credentials_safe TO authenticated;
