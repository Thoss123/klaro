-- Idempotent n8n deploys: link each deployed workflow row to its canvas workflow.
-- Without this, every deploy/test created a brand-new n8n workflow (the client-side
-- dedup map was never hydrated from the DB), polluting n8n with duplicates and
-- breaking inspect/stop on "the" workflow.

alter table workflows add column if not exists canvas_workflow_id text;

-- One canvas workflow -> at most one deployed row per user/project.
-- Partial index: legacy rows (canvas_workflow_id is null) are exempt.
create unique index if not exists workflows_user_project_canvas_key
  on workflows (user_id, project_id, canvas_workflow_id)
  where canvas_workflow_id is not null;
