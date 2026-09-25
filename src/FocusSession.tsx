import { useEffect, useMemo, useState } from 'react';
import {
  Check, Hourglass, SkipForward, Pause, Play, Square, Minimize2, Mail, Phone, User,
  ClipboardList, Copy, CheckCircle2, Clock, Flag, Calendar, Loader2,
} from 'lucide-react';
import type { Task } from '@/lib/supabase';
import {
  type ActiveSession, type Outcome, buildStatusReport, elapsed, estimateOf, formatClock, isOverdue,
} from '@/lib/session';

const CONTACT_ICONS: Record<string, typeof Mail> = { email: Mail, phone: Phone, 'in-person': User };

export default function FocusSession({
  session,
  tasks,
  onChange,
  onSetStatus,
  onMinimize,
  onClose,
}: {
  session: ActiveSession;
  tasks: Task[];
  onChange: (s: ActiveSession) => void;
  onSetStatus: (task: Task, status: Task['status']) => Promise<boolean>;
  onMinimize: () => void;
  onClose: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const running = session.runningSince !== null;
  useEffect(() => {
    if (!running || session.finished) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running, session.finished]);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  // Skip over tasks that were deleted mid-session.
  let index = session.index;
  while (index < session.queue.length && !byId.has(session.queue[index])) index++;
  const current = index < session.queue.length ? byId.get(session.queue[index])! : null;
  const showSummary = session.finished || !current;

  const budgetMs = session.budgetMinutes * 60_000;
  const usedMs = elapsed(session.elapsedMs, session.runningSince, now);
  const remainingMs = budgetMs - usedMs;
  const taskMs = elapsed(session.taskElapsedMs, session.taskRunningSince, now);

  const advance = (outcome: Outcome) => {
    const t = Date.now();
    const next: ActiveSession = {
      ...session,
      index: index + 1,
      outcomes: { ...session.outcomes, [session.queue[index]]: outcome },
      taskElapsedMs: 0,
      taskRunningSince: session.runningSince !== null ? t : null,
    };
    if (next.index >= session.queue.length) {
      next.finished = true;
      next.elapsedMs = elapsed(session.elapsedMs, session.runningSince, t);
      next.runningSince = null;
      next.taskRunningSince = null;
    }
    onChange(next);
  };

  const mark = async (status: 'completed' | 'waiting') => {
    if (!current) return;
    setBusy(true);
    const ok = await onSetStatus(current, status);
    setBusy(false);
    if (ok) advance(status === 'completed' ? 'done' : 'waiting');
  };

  const togglePause = () => {
    const t = Date.now();
    if (running) {
      onChange({
        ...session,
        elapsedMs: elapsed(session.elapsedMs, session.runningSince, t),
        runningSince: null,
        taskElapsedMs: elapsed(session.taskElapsedMs, session.taskRunningSince, t),
        taskRunningSince: null,
      });
    } else {
      onChange({ ...session, runningSince: t, taskRunningSince: t });
    }
    setNow(t);
  };

  const endSession = () => {
    const t = Date.now();
    onChange({
      ...session,
      finished: true,
      elapsedMs: elapsed(session.elapsedMs, session.runningSince, t),
      runningSince: null,
      taskRunningSince: null,
    });
  };

  const copyReport = async () => {
    const text = buildStatusReport(session, byId);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers that block the clipboard API
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const doneCount = Object.values(session.outcomes).filter((o) => o === 'done').length;
  const upNext = session.queue
    .slice(index + 1)
    .map((id) => byId.get(id))
    .filter((t): t is Task => !!t);

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-slate-950 text-slate-100">
      {/* Top bar */}
      <div className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {showSummary ? 'Session complete' : `Task ${index + 1} of ${session.queue.length}`}
            </p>
            <p className={`font-mono text-2xl font-semibold tabular-nums ${remainingMs < 0 ? 'text-red-400' : 'text-white'}`}>
              {formatClock(remainingMs)}
              <span className="ml-2 text-xs font-normal text-slate-500">
                {remainingMs < 0 ? 'over' : 'left'} of {session.budgetMinutes} min
              </span>
            </p>
          </div>
          {!showSummary && (
            <div className="flex items-center gap-1">
              <IconButton label={running ? 'Pause' : 'Resume'} onClick={togglePause}>
                {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </IconButton>
              <IconButton label="Back to list" onClick={onMinimize}>
                <Minimize2 className="h-4 w-4" />
              </IconButton>
              <IconButton label="End session" onClick={endSession}>
                <Square className="h-4 w-4" />
              </IconButton>
            </div>
          )}
        </div>
        <div className="h-1 bg-slate-800">
          <div
            className={`h-full transition-all ${remainingMs < 0 ? 'bg-red-500' : 'bg-emerald-500'}`}
            style={{ width: `${Math.min(100, (usedMs / budgetMs) * 100)}%` }}
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
          {showSummary ? (
            <Summary
              session={session}
              byId={byId}
              usedMs={usedMs}
              copied={copied}
              onCopy={copyReport}
              onClose={onClose}
            />
          ) : (
            <>
              {!running && (
                <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-300">
                  Paused — timers are stopped.
                </div>
              )}

              {/* Current task */}
              <CurrentTask task={current!} taskMs={taskMs} />

              {/* Actions */}
              <div className="mt-4 grid grid-cols-3 gap-2">
                <button
                  disabled={busy}
                  onClick={() => mark('completed')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3 py-3 text-sm font-semibold text-slate-950 transition-colors hover:bg-emerald-400 disabled:opacity-50"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Done
                </button>
                <button
                  disabled={busy}
                  onClick={() => mark('waiting')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm font-semibold text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <Hourglass className="h-4 w-4" />
                  Waiting
                </button>
                <button
                  disabled={busy}
                  onClick={() => advance('skipped')}
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-700 px-3 py-3 text-sm font-semibold text-slate-300 transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  <SkipForward className="h-4 w-4" />
                  Skip
                </button>
              </div>
              <p className="mt-2 text-center text-xs text-slate-500">
                {doneCount} done so far · Waiting = blocked on someone else · Skip = carry over
              </p>

              {/* Up next */}
              {upNext.length > 0 && (
                <div className="mt-8">
                  <h3 className="mb-2 text-sm font-medium text-slate-400">Up next</h3>
                  <ol className="space-y-1.5">
                    {upNext.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 rounded-lg border border-slate-800 px-3 py-2 text-sm">
                        <span className="w-24 shrink-0 truncate font-medium text-slate-300">{t.poc}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-400">{t.task_notes}</span>
                        <span className="shrink-0 text-xs text-slate-500">{estimateOf(t)}m</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function CurrentTask({ task, taskMs }: { task: Task; taskMs: number }) {
  const Icon = CONTACT_ICONS[task.contact_method.toLowerCase()] ?? ClipboardList;
  const estMs = estimateOf(task) * 60_000;
  const overEst = taskMs > estMs;
  const overdue = isOverdue(task.due_date);

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900 p-5 sm:p-6">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold text-white">{task.poc}</span>
        <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
          <Icon className="h-3 w-3" />
          {task.contact_method}
        </span>
        {task.priority && (
          <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs capitalize text-slate-300">
            <Flag className="h-3 w-3" />
            {task.priority}
          </span>
        )}
        {task.due_date && (
          <span
            className={`inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs ${overdue ? 'text-red-400' : 'text-slate-300'}`}
          >
            <Calendar className="h-3 w-3" />
            {overdue ? 'Overdue · ' : 'Due '}
            {new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap text-base leading-relaxed text-slate-200">{task.task_notes}</p>
      <div className={`mt-4 inline-flex items-center gap-1.5 text-sm ${overEst ? 'text-amber-400' : 'text-slate-400'}`}>
        <Clock className="h-4 w-4" />
        <span className="font-mono tabular-nums">{formatClock(taskMs)}</span>
        <span>
          on this task · est. {estimateOf(task)} min{task.estimated_minutes == null ? ' (default)' : ''}
        </span>
      </div>
    </div>
  );
}

function Summary({
  session,
  byId,
  usedMs,
  copied,
  onCopy,
  onClose,
}: {
  session: ActiveSession;
  byId: Map<string, Task>;
  usedMs: number;
  copied: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const groups: { title: string; color: string; ids: string[] }[] = [
    { title: 'Completed', color: 'text-emerald-400', ids: session.queue.filter((id) => session.outcomes[id] === 'done') },
    { title: 'Waiting on others', color: 'text-amber-400', ids: session.queue.filter((id) => session.outcomes[id] === 'waiting') },
    {
      title: 'Carry over',
      color: 'text-slate-300',
      ids: session.queue.filter((id) => !session.outcomes[id] || session.outcomes[id] === 'skipped'),
    },
  ];

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
        <div>
          <h2 className="text-lg font-semibold text-white">Session wrap-up</h2>
          <p className="text-sm text-slate-400">
            {Math.round(usedMs / 60_000)} of {session.budgetMinutes} min used
          </p>
        </div>
      </div>

      <div className="space-y-5">
        {groups.map((g) => {
          const items = g.ids.map((id) => byId.get(id)).filter((t): t is Task => !!t);
          if (items.length === 0) return null;
          return (
            <div key={g.title}>
              <h3 className={`mb-2 text-sm font-semibold ${g.color}`}>
                {g.title} ({items.length})
              </h3>
              <ul className="space-y-1.5">
                {items.map((t) => (
                  <li key={t.id} className="rounded-lg border border-slate-800 px-3 py-2 text-sm">
                    <span className="font-medium text-slate-200">{t.poc}</span>
                    <span className="text-slate-400"> — {t.task_notes}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap justify-end gap-2">
        <button
          onClick={onCopy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-800"
        >
          {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy status update'}
        </button>
        <button
          onClick={onClose}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
    >
      {children}
    </button>
  );
}
