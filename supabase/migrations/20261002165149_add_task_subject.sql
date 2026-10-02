/*
# Add subject column to tasks table

## Purpose
Add a nullable text column `subject` to the tasks table so tasks can have
a short subject/title line in addition to the full task_notes.

## Changes to `tasks` table
- New column: `subject` (text, nullable) — optional short subject, max 60 chars.
- New CHECK constraint: `tasks_subject_length_check` requiring
  `subject IS NULL OR char_length(subject) <= 60`.

## Security
- No RLS policy changes. Existing anon+authenticated full-access policies
  remain in effect.

## Notes
1. The column is nullable so existing rows keep all their data (start null).
2. Frontend code for this field is already written and saved.
*/

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS subject text;

ALTER TABLE tasks
  DROP CONSTRAINT IF EXISTS tasks_subject_length_check;
ALTER TABLE tasks
  ADD CONSTRAINT tasks_subject_length_check
  CHECK (subject IS NULL OR char_length(subject) <= 60);