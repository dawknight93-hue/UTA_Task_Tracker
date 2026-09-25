/*
# Create tasks table (single-tenant, no auth)

## Purpose
Tracks action items assigned during a military Reserve drill weekend (UTA)
that need to be worked and completed over the following month.

## New Tables
- `tasks`
  - `id` (uuid, primary key, auto-generated)
  - `poc` (text, not null — the point of contact who assigned the task)
  - `contact_method` (text, not null — e.g. email, phone, in-person)
  - `task_notes` (text, not null — description of what needs to be done)
  - `status` (text, not null, default 'pending' — either 'pending' or 'completed')
  - `created_at` (timestamptz, default now)
  - `completed_at` (timestamptz, nullable — stamped when task is marked complete)

## Security
- Enable RLS on `tasks`.
- Allow anon + authenticated full CRUD because this is a single-tenant
  personal tool with no sign-in screen. USING(true) is intentional —
  the data is intentionally shared/public per the app's design.

## Notes
1. A CHECK constraint on `status` ensures only 'pending' or 'completed' values.
2. An index on (status, created_at) supports the common filter+sort queries.
*/

CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  poc text NOT NULL,
  contact_method text NOT NULL,
  task_notes text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_tasks" ON tasks;
CREATE POLICY "anon_select_tasks" ON tasks FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_tasks" ON tasks;
CREATE POLICY "anon_insert_tasks" ON tasks FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_tasks" ON tasks;
CREATE POLICY "anon_update_tasks" ON tasks FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_tasks" ON tasks;
CREATE POLICY "anon_delete_tasks" ON tasks FOR DELETE
  TO anon, authenticated USING (true);

CREATE INDEX IF NOT EXISTS idx_tasks_status_created_at
  ON tasks (status, created_at);