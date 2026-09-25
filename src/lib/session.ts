import type { Task } from '@/lib/supabase';

export const DEFAULT_ESTIMATE = 15;
export const SESSION_LENGTHS = [60, 90, 120] as const;
const STORAGE_KEY = 'uta-active-session-v1';

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

export type Outcome = 'done' | 'waiting' | 'skipped';

export type ActiveSession = {
  budgetMinutes: number;
  queue: string[]; // task ids in work order
  index: number; // current position in queue
  outcomes: Record<string, Outcome>;
  // Timer: total elapsed = elapsedMs + (runningSince ? now - runningSince : 0)
  elapsedMs: number;
  runningSince: number | null;
  // Per-task timer for the current task
  taskElapsedMs: number;
  taskRunningSince: number | null;
  startedAt: number;
  finished: boolean;
};

export function estimateOf(task: Task) {
  return task.estimated_minutes ?? DEFAULT_ESTIMATE;
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  return new Date(dueDate + 'T00:00:00') < todayStart();
}

/** Same ordering the main list uses: overdue, due date, priority, oldest first. */
export function compareUrgency(a: Task, b: Task) {
  const ao = isOverdue(a.due_date);
  const bo = isOverdue(b.due_date);
  if (ao !== bo) return ao ? -1 : 1;
  if (a.due_date && b.due_date) {
    const c = a.due_date.localeCompare(b.due_date);
    if (c !== 0) return c;
  } else if (a.due_date || b.due_date) {
    return a.due_date ? -1 : 1;
  }
  const ar = a.priority ? PRIORITY_RANK[a.priority] : 3;
  const br = b.priority ? PRIORITY_RANK[b.priority] : 3;
  if (ar !== br) return ar - br;
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
}

/**
 * Fill the session with the most urgent pending tasks that fit the time budget.
 * Walks tasks in urgency order and skips any that would overflow, so smaller
 * tasks further down can still fill the remaining time.
 */
export function buildPlan(tasks: Task[], budgetMinutes: number) {
  const candidates = tasks.filter((t) => t.status === 'pending').sort(compareUrgency);
  const selected: Task[] = [];
  const leftOut: Task[] = [];
  let used = 0;
  for (const t of candidates) {
    const est = estimateOf(t);
    if (used + est <= budgetMinutes) {
      selected.push(t);
      used += est;
    } else {
      leftOut.push(t);
    }
  }
  return { selected, leftOut };
}

/**
 * Batch tasks by contact method (all calls together, all emails together...).
 * Groups are ordered by their most urgent task, and urgency order is kept inside each group.
 */
export function groupByContact(tasks: Task[]) {
  const groups = new Map<string, Task[]>();
  for (const t of tasks) {
    const key = t.contact_method.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }
  return [...groups.values()].flat();
}

export function totalMinutes(tasks: Task[]) {
  return tasks.reduce((sum, t) => sum + estimateOf(t), 0);
}

export function elapsed(ms: number, since: number | null, now = Date.now()) {
  return ms + (since ? now - since : 0);
}

export function formatClock(ms: number) {
  const neg = ms < 0;
  const s = Math.floor(Math.abs(ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const body = `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
  return neg ? `-${body}` : body;
}

export function loadSession(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ActiveSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: ActiveSession | null) {
  try {
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable — session just won't survive a reload */
  }
}

/** Plain-text status update to paste into an email or Teams message. */
export function buildStatusReport(session: ActiveSession, tasksById: Map<string, Task>) {
  const line = (t: Task) => `- ${t.poc}: ${t.task_notes}`;
  const pick = (o: Outcome | undefined) =>
    session.queue
      .filter((id) => session.outcomes[id] === o)
      .map((id) => tasksById.get(id))
      .filter((t): t is Task => !!t);

  const done = pick('done');
  const waiting = pick('waiting');
  const open = session.queue
    .filter((id) => !session.outcomes[id] || session.outcomes[id] === 'skipped')
    .map((id) => tasksById.get(id))
    .filter((t): t is Task => !!t);

  const date = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const parts = [`UTA task update (${date})`];
  if (done.length) parts.push('', `Completed (${done.length}):`, ...done.map(line));
  if (waiting.length) parts.push('', `Waiting on others (${waiting.length}):`, ...waiting.map(line));
  if (open.length) parts.push('', `Still open (${open.length}):`, ...open.map(line));
  return parts.join('\n');
}
