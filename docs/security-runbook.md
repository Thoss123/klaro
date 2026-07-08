# Security Runbook — Axantilo

Operational checklist for secrets, tokens, and infrastructure hardening.

## Before Production Launch

1. Set `ADMIN_EMAILS` in Vercel (comma-separated admin emails).
2. Set `SUPABASE_SERVICE_ROLE_KEY` — required in production (app throws without it).
3. Set `ENCRYPTION_KEY` to a random 32+ byte hex string (`openssl rand -hex 32`).
4. Optionally set `ENCRYPTION_SALT` (changing it invalidates existing encrypted credentials).
5. Set `WORKSPACE_API_TOKEN` to a long random value for n8n machine API calls.
6. Never set `ENABLE_SIM_DEV=true` in production unless debugging with admin auth.
7. Run `npm run db:push` to apply RLS migrations.

## WORKSPACE_API_TOKEN Rotation

1. Generate new token: `openssl rand -hex 32`
2. Update Vercel env `WORKSPACE_API_TOKEN`
3. Update all n8n workflows that call `/api/workspace`, `/api/agent/llm`, `/api/agent/pending`
4. Redeploy Axantilo
5. Revoke old token (remove from env)

## n8n Instance Hardening

- Enable 2FA on n8n admin accounts
- Restrict n8n UI access (VPN / IP allowlist on Hostinger firewall)
- Rotate `N8N_API_KEY` periodically
- OAuth app secrets are duplicated into user credentials — treat n8n credential store as sensitive
- Long-term: migrate to n8n central OAuth flow (store credential IDs only, not client secrets per user)

## RLS Verification (Supabase SQL Editor)

```sql
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('sessions','messages','canvas','project_canvas','project_memory');
```

All should show `rowsecurity = true`.

## Incident Response

If a secret is leaked:

| Secret | Action |
|--------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Rotate in Supabase dashboard, update Vercel, audit DB access logs |
| `WORKSPACE_API_TOKEN` | Rotate per section above |
| `N8N_API_KEY` | Regenerate in n8n, update Vercel |
| OAuth client secrets | Rotate in Google/Azure console, re-connect user credentials |
| `ENCRYPTION_KEY` | Cannot rotate without re-encrypting all `user_credentials` |
