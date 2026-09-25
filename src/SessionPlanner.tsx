import { useMemo, useState } from 'react';
import { X, Timer, Clock, Flag, Calendar, Plus, Minus, Layers, AlertTriangle, Play } from 'lucide-react';
import type { Task } from '@/lib/supabase';
import {
  SESSION_LENGTHS, DEFAULT_ESTIMATE, buildPlan, compareUrgency, estimateOf,
  groupByContact, isOverdue,
} from '@/lib/session';

const PRIORITY_TEXT: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-amber-400',
  low: 'text-slate-400',
};

export default function SessionPlanner({
  tasks,
  onClose,
  onStart,
}: {
  tasks: Task[];
  onClose: () => void;
  onStart: (budgetMinutes: number, queue: string[]) => void;
}) {
  const [budget, setBudget] = useState<number>(90);
  const [batch, setBatch] = useState(true);
  const [chosen, setChosen] = useState<Set<string>>(
    () => new Set(buildPlan(tasks, 90).selected.map((t) => t.id)),
  );

  const pending = useMemo(
    () => tasks.filter((t) => t.status === 'pending').sort(compareUrgency),
    [tasks],
  );
  const waitingCount = tasks.filter((t) => t.status === 'waiting').length;

  const pickBudget = (m: number) => {
    setBudget(m);
    setChosen(new Set(buildPlan(tasks, m).selected.map((t) => t.id)));
  };

  const inPlan = pending.filter((t) => chosen.has(t.id));
  const ordered = batch ? groupByContact(inPlan) : inPlan;
  const notInPlan = pending.filter((t) => !chosen.has(t.id));
  const planned = inPlan.reduce((s, t) => s + estimateOf(t), 0);
  const over = planned > budget;
  const noEstimate = inPlan.filter((t) => t.estimated_minutes == null).length;

  const toggle = (id: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pct = Math.min(100, (planned / budget) * 100);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-2">
            <Timer className="h-5 w-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Plan a Work Session</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {/* Budget */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-300">How much time do you have?</span>
            <div className="flex gap-2">
              {SESSION_LENGTHS.map((m) => (
                <button
                  key={m}
                  onClick={() => pickBudget(m)}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    budget === m
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  {m === 60 ? '1 hr' : m === 90 ? '1.5 hr' : '2 hr'}
                </button>
              ))}
            </div>
          </div>

          {/* Fill meter */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-slate-400">
                {ordered.length} task{ordered.length === 1 ? '' : 's'} · {planned} of {budget} min planned
              </span>
              {over && (
                <span className="inline-flex items-center gap-1 text-amber-400">
                  <AlertTriangle className="h-3 w-3" /> {planned - budget} min over
                </span>
              )}
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full transition-all ${over ? 'bg-amber-500' : 'bg-emerald-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Batch toggle */}
          <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800 px-3 py-2.5">
            <span className="flex items-center gap-2 text-sm text-slate-300">
              <Layers className="h-4 w-4 text-slate-400" />
              Batch by contact method
              <span className="text-xs text-slate-500">(calls together, emails together)</span>
            </span>
            <input
              type="checkbox"
              checked={batch}
              onChange={(e) => setBatch(e.target.checked)}
              className="h-4 w-4 accent-emerald-500"
            />
          </label>

          {/* Plan */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-300">Session queue</span>
            {ordered.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-800 py-6 text-center text-sm text-slate-500">
                {pending.length === 0 ? 'No pending tasks.' : 'Nothing selected — add tasks below.'}
              </p>
            ) : (
              <ol className="space-y-1.5">
                {ordered.map((t, i) => (
                  <PlanRow key={t.id} task={t} index={i + 1} onToggle={() => toggle(t.id)} included />
                ))}
              </ol>
            )}
            {noEstimate > 0 && (
              <p className="mt-2 text-xs text-slate-500">
                {noEstimate} task{noEstimate === 1 ? ' has' : 's have'} no time estimate — counted as {DEFAULT_ESTIMATE} min.
              </p>
            )}
          </div>

          {notInPlan.length > 0 && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-400">Didn't fit / not selected</span>
              <ul className="space-y-1.5">
                {notInPlan.map((t) => (
                  <PlanRow key={t.id} task={t} onToggle={() => toggle(t.id)} included={false} />
                ))}
              </ul>
            </div>
          )}

          {waitingCount > 0 && (
            <p className="text-xs text-slate-500">
              {waitingCount} task{waitingCount === 1 ? ' is' : 's are'} waiting on others and left out.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-slate-800 px-5 py-4">
          <button
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            disabled={ordered.length === 0}
            onClick={() => onStart(budget, ordered.map((t) => t.id))}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Start Session
          </button>
        </div>
      </div>
    </div>
  );
}

function PlanRow({
  task,
  index,
  included,
  onToggle,
}: {
  task: Task;
  index?: number;
  included: boolean;
  onToggle: () => void;
}) {
  const overdue = isOverdue(task.due_date);
  return (
    <li
      className={`flex items-start gap-2.5 rounded-lg border px-3 py-2 ${
        included ? 'border-slate-800 bg-slate-950/40' : 'border-slate-800/60 opacity-70'
      }`}
    >
      {index !== undefined && (
        <span className="mt-0.5 w-4 shrink-0 text-right text-xs font-semibold text-slate-500">{index}</span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs">
          <span className="font-semibold text-slate-200">{task.poc}</span>
          <span className="text-slate-500">{task.contact_method}</span>
          {task.priority && (
            <span className={`inline-flex items-center gap-0.5 ${PRIORITY_TEXT[task.priority]}`}>
              <Flag className="h-3 w-3" />
              {task.priority}
            </span>
          )}
          {task.due_date && (
            <span className={`inline-flex items-center gap-0.5 ${overdue ? 'text-red-400' : 'text-slate-400'}`}>
              <Calendar className="h-3 w-3" />
              {overdue ? 'Overdue' : `Due ${new Date(task.due_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
            </span>
          )}
        </div>
        <p className="truncate text-sm text-slate-300">{task.task_notes}</p>
      </div>
      <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-xs text-slate-400">
        <Clock className="h-3 w-3" />
        {task.estimated_minutes ?? `~${DEFAULT_ESTIMATE}`}m
      </span>
      <button
        onClick={onToggle}
        aria-label={included ? 'Remove from session' : 'Add to session'}
        className={`shrink-0 rounded-md p-1 transition-colors ${
          included
            ? 'text-slate-500 hover:bg-red-500/10 hover:text-red-400'
            : 'text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-400'
        }`}
      >
        {included ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
      </button>
    </li>
  );
}
