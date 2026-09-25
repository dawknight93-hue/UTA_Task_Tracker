/*
# Add planning fields and expand status options

## Purpose
Round 1 upgrade: add planning fields to tasks so the user can plan
1-2 hour work sessions between drill weekends.

## Changes to `tasks` table

### New columns (all nullable, existing rows keep their data)
- `estimated_minutes` (integer, nullable) — allowed values 5, 15, 30, 60.
  A CHECK constraint enforces the allowlist when the value is not null.
- `priority` (text, nullable) — 'high', 'medium', or 'low'.
  A CHECK constraint enforces the allowlist when the value is not null.
- `due_date` (date, nullable) — target completion date for the task.

### Modified constraints
- The existing `tasks_status_check` constraint (status IN ('pending', 'completed'))
  is replaced with one that also allows 'waiting' (blocked on someone else).
  Existing rows are untouched — their status values are already valid
  under the new constraint.

## Security
- No RLS policy changes. Existing anon+authenticated full-access policies
  remain in effect.

## Notes
1. All new columns are nullable so existing rows start with null values.
2. The status constraint is dropped and recreated — no data is altered.
3. An index on (status, due_date) supports the new sort order.
*/

-- Add new columns (all nullable)
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS estimated_minutes integer,
  ADD COLUMN IF NOT EXISTS priority text,
  ADD COLUMN IF NOT EXISTS due_date date;

-- Add CHECK constraints for the new columns
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_estimated_minutes_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_estimated_minutes_check
  CHECK (estimated_minutes IS NULL OR estimated_minutes IN (5, 15, 30, 60));

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_priority_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_priority_check
  CHECK (priority IS NULL OR priority IN ('high', 'medium', 'low'));

-- Replace the status CHECK constraint to include 'waiting'
ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_status_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_status_check
  CHECK (status IN ('pending', 'waiting', 'completed'));

-- Index for the new sort order (overdue first, then due date)
CREATE INDEX IF NOT EXISTS idx_tasks_status_due_date
  ON tasks (status, due_date);