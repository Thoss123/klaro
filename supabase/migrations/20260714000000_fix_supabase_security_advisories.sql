-- Behebt Supabase Security Advisories:
--   rls_disabled_in_public      → waitlist_signups (RLS war fälschlich deaktiviert)
--   sensitive_columns_exposed   → waitlist_signups (PII) + user_credentials.encrypted_value
--
-- waitlist_signups: Zugriff ausschließlich über Server-API mit Service Role (siehe app/api/waitlist).
-- user_credentials: SELECT nur auf Metadaten-Spalten; encrypted_value nur via service_role.

-- ── waitlist_signups: RLS wieder aktivieren, keine öffentlichen Policies ─────
ALTER TABLE public.waitlist_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can insert waitlist signup" ON public.waitlist_signups;
DROP POLICY IF EXISTS "Public can update waitlist signup" ON public.waitlist_signups;

REVOKE ALL ON TABLE public.waitlist_signups FROM anon;
REVOKE ALL ON TABLE public.waitlist_signups FROM authenticated;

-- ── user_credentials: sensitive column nicht über Data API lesbar ───────────
REVOKE ALL ON TABLE public.user_credentials FROM anon;

REVOKE SELECT ON TABLE public.user_credentials FROM authenticated;
GRANT SELECT (
  id,
  user_id,
  project_id,
  tool_name,
  credential_type,
  status,
  n8n_credential_id,
  created_at,
  updated_at
) ON TABLE public.user_credentials TO authenticated;

GRANT INSERT, UPDATE, DELETE ON TABLE public.user_credentials TO authenticated;

-- Safe view (ohne encrypted_value) für explizite Client-Reads
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

REVOKE ALL ON public.user_credentials_safe FROM anon;
GRANT SELECT ON public.user_credentials_safe TO authenticated;
