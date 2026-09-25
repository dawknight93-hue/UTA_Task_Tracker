import { useEffect, useState, useCallback } from 'react';
import {
  Plus, Check, Trash2, X, Mail, Phone, User, ClipboardList, Loader2,
  Pencil, Clock, Flag, Calendar, Hourglass,
} from 'lucide-react';
import { supabase, type Task } from '@/lib/supabase';

type FilterTab = 'all' | 'pending' | 'waiting' | 'completed';
type Priority = 'high' | 'medium' | 'low';

const CONTACT_METHOD_ICONS: Record<string, typeof Mail> = {
  email: Mail,
  phone: Phone,
  'in-person': User,
};

const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const PRIORITY_STYLES: Record<Priority, { badge: string; dot: string; label: string }> = {
  high: { badge: 'bg-red-500/15 text-red-400', dot: 'bg-red-400', label: 'High' },
  medium: { badge: 'bg-amber-500/15 text-amber-400', dot: 'bg-amber-400', label: 'Medium' },
  low: { badge: 'bg-slate-600/30 text-slate-400', dot: 'bg-slate-400', label: 'Low' },
};

const TIME_OPTIONS = [5, 15, 30, 60] as const;

function getContactIcon(method: string) {
  return CONTACT_METHOD_ICONS[method.toLowerCase()] ?? ClipboardList;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDueDate(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  const hours = Math.floor(diff / 3_600_000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  const mins = Math.floor(diff / 60_000);
  return mins > 0 ? `${mins}m ago` : 'just now';
}

function isOverdue(dueDate: string | null) {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(dueDate + 'T00:00:00') < today;
}

function isDueSoon(dueDate: string | null) {
  if (!dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + 'T00:00:00');
  const diffDays = (due.getTime() - today.getTime()) / 86_400_000;
  return diffDays >= 0 && diffDays <= 3;
}

function dueDateColor(dueDate: string | null): string {
  if (isOverdue(dueDate)) return 'text-red-400';
  if (isDueSoon(dueDate)) return 'text-amber-400';
  return 'text-slate-400';
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterTab>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editTarget, setEditTarget] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await supabase
      .from('tasks')
      .select('*')
      .order('created_at', { ascending: false });

    if (fetchError) {
      setError(fetchError.message);
    } else if (data) {
      setTasks(data as Task[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const pendingCount = tasks.filter((t) => t.status === 'pending').length;
  const waitingCount = tasks.filter((t) => t.status === 'waiting').length;
  const completedCount = tasks.filter((t) => t.status === 'completed').length;

  const sortedTasks = [...tasks].sort((a, b) => {
    // Group: pending + waiting first, then completed
    const aActive = a.status !== 'completed';
    const bActive = b.status !== 'completed';
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;

    if (aActive && bActive) {
      // Overdue first
      const aOverdue = isOverdue(a.due_date);
      const bOverdue = isOverdue(b.due_date);
      if (aOverdue && !bOverdue) return -1;
      if (!aOverdue && bOverdue) return 1;

      // Due date ascending, nulls last
      if (a.due_date && b.due_date) {
        const cmp = a.due_date.localeCompare(b.due_date);
        if (cmp !== 0) return cmp;
      } else if (a.due_date && !b.due_date) {
        return -1;
      } else if (!a.due_date && b.due_date) {
        return 1;
      }

      // Priority high > medium > low, nulls last
      const aRank = a.priority ? PRIORITY_RANK[a.priority] : 3;
      const bRank = b.priority ? PRIORITY_RANK[b.priority] : 3;
      if (aRank !== bRank) return aRank - bRank;

      // Created date ascending (oldest first)
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }

    // Completed: most recently completed first
    return new Date(b.completed_at ?? b.created_at).getTime() - new Date(a.completed_at ?? a.created_at).getTime();
  });

  const filteredTasks = sortedTasks.filter((t) => {
    if (filter === 'pending') return t.status === 'pending';
    if (filter === 'waiting') return t.status === 'waiting';
    if (filter === 'completed') return t.status === 'completed';
    return true;
  });

  const handleToggleComplete = async (task: Task) => {
    setUpdatingId(task.id);
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    const newCompletedAt = newStatus === 'completed' ? new Date().toISOString() : null;

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ status: newStatus, completed_at: newCompletedAt })
      .eq('id', task.id);

    setUpdatingId(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id ? { ...t, status: newStatus, completed_at: newCompletedAt } : t,
      ),
    );
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', deleteTarget.id);
    if (deleteError) {
      setError(deleteError.message);
      setDeleteTarget(null);
      return;
    }
    setTasks((prev) => prev.filter((t) => t.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
        <div className="mx-auto max-w-3xl px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 ring-1 ring-emerald-500/30">
                <ClipboardList className="h-5 w-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-lg font-semibold tracking-tight text-white sm:text-xl">
                  UTA Task Tracker
                </h1>
                <p className="text-xs text-slate-400">
                  {pendingCount} pending · {waitingCount} waiting · {completedCount} completed
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400 active:scale-[0.98] sm:px-4"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Task</span>
              <span className="sm:hidden">Add</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        {/* Filter tabs */}
        <div className="mb-5 flex flex-wrap items-center gap-1.5">
          <FilterButton label="All" active={filter === 'all'} onClick={() => setFilter('all')} />
          <FilterButton
            label="Pending"
            active={filter === 'pending'}
            onClick={() => setFilter('pending')}
            badge={pendingCount}
          />
          <FilterButton
            label="Waiting"
            active={filter === 'waiting'}
            onClick={() => setFilter('waiting')}
            badge={waitingCount}
          />
          <FilterButton
            label="Completed"
            active={filter === 'completed'}
            onClick={() => setFilter('completed')}
          />
        </div>

        {/* Error banner */}
        {error && (
          <div className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="shrink-0 text-red-400 hover:text-red-300">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Task list */}
        {loading ? (
          <div className="flex items-center justify-center py-20 text-slate-500">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filteredTasks.length === 0 ? (
          <EmptyState filter={filter} onAdd={() => setShowAddModal(true)} />
        ) : (
          <div className="space-y-3">
            {filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                updating={updatingId === task.id}
                onToggleComplete={() => handleToggleComplete(task)}
                onDelete={() => setDeleteTarget(task)}
                onEdit={() => setEditTarget(task)}
              />
            ))}
          </div>
        )}
      </main>

      {/* Add Task Modal */}
      {showAddModal && (
        <TaskFormModal
          mode="create"
          onClose={() => setShowAddModal(false)}
          onSaved={(task) => {
            setTasks((prev) => [...prev, task]);
            setShowAddModal(false);
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Edit Task Modal */}
      {editTarget && (
        <TaskFormModal
          mode="edit"
          task={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={(task) => {
            setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)));
            setEditTarget(null);
          }}
          onError={(msg) => setError(msg)}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete task?"
          message={`This will permanently remove the task from "${deleteTarget.poc}". This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}

function FilterButton({
  label,
  active,
  onClick,
  badge,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  badge?: number;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-colors ${
        active
          ? 'bg-slate-800 text-white'
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-200'
      }`}
    >
      {label}
      {badge !== undefined && badge > 0 && (
        <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-emerald-500/20 px-1.5 text-xs font-semibold text-emerald-400">
          {badge}
        </span>
      )}
    </button>
  );
}

function TaskCard({
  task,
  updating,
  onToggleComplete,
  onDelete,
  onEdit,
}: {
  task: Task;
  updating: boolean;
  onToggleComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const isCompleted = task.status === 'completed';
  const isWaiting = task.status === 'waiting';
  const ContactIcon = getContactIcon(task.contact_method);

  return (
    <div
      className={`group rounded-xl border p-4 transition-colors ${
        isCompleted
          ? 'border-slate-800 bg-slate-900/40'
          : 'border-slate-800 bg-slate-900 hover:border-slate-700'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <button
          onClick={onToggleComplete}
          disabled={updating}
          aria-label={isCompleted ? 'Mark as pending' : 'Mark as complete'}
          className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border transition-all ${
            isCompleted
              ? 'border-emerald-500 bg-emerald-500 text-slate-950'
              : 'border-slate-600 text-transparent hover:border-emerald-500 hover:bg-emerald-500/10'
          } ${updating ? 'opacity-50' : ''}`}
        >
          {updating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
        </button>

        {/* Content — clickable to edit */}
        <div
          className="min-w-0 flex-1 cursor-pointer"
          onClick={onEdit}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onEdit();
            }
          }}
        >
          <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span
              className={`text-sm font-semibold ${
                isCompleted ? 'text-slate-500 line-through' : 'text-slate-200'
              }`}
            >
              {task.poc}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
              <ContactIcon className="h-3 w-3" />
              {task.contact_method}
            </span>
            {isWaiting && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                <Hourglass className="h-3 w-3" />
                Waiting
              </span>
            )}
          </div>
          <p
            className={`text-sm leading-relaxed ${
              isCompleted ? 'text-slate-500 line-through' : 'text-slate-300'
            }`}
          >
            {task.task_notes}
          </p>

          {/* Planning badges */}
          {!isCompleted && (task.priority || task.estimated_minutes || task.due_date) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {task.priority && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium ${PRIORITY_STYLES[task.priority].badge}`}
                >
                  <Flag className="h-3 w-3" />
                  {PRIORITY_STYLES[task.priority].label}
                </span>
              )}
              {task.estimated_minutes && (
                <span className="inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                  <Clock className="h-3 w-3" />
                  {task.estimated_minutes}m
                </span>
              )}
              {task.due_date && (
                <span
                  className={`inline-flex items-center gap-1 rounded-md bg-slate-800 px-2 py-0.5 text-xs ${dueDateColor(task.due_date)}`}
                >
                  <Calendar className="h-3 w-3" />
                  Due {formatDueDate(task.due_date)}
                </span>
              )}
            </div>
          )}

          <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
            <span>Created {formatDate(task.created_at)}</span>
            {isCompleted && task.completed_at && (
              <span className="text-emerald-600">
                Completed {relativeTime(task.completed_at)}
              </span>
            )}
            {!isCompleted && <span className="text-slate-600">{relativeTime(task.created_at)}</span>}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={onEdit}
            aria-label="Edit task"
            className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-slate-700/50 hover:text-slate-300"
          >
            <Pencil className="h-4 w-4" />
          </button>
          <button
            onClick={onDelete}
            aria-label="Delete task"
            className="rounded-md p-1.5 text-slate-600 transition-colors hover:bg-red-500/10 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ filter, onAdd }: { filter: FilterTab; onAdd: () => void }) {
  const messages: Record<FilterTab, string> = {
    pending: 'No pending tasks — everything is handled.',
    waiting: 'No tasks waiting on others.',
    completed: 'No completed tasks yet.',
    all: 'No tasks yet. Add your first action item to get started.',
  };

  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 py-16 text-center">
      <ClipboardList className="mb-3 h-10 w-10 text-slate-700" />
      <p className="mb-4 text-sm text-slate-500">{messages[filter]}</p>
      {filter === 'all' && (
        <button
          onClick={onAdd}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400"
        >
          <Plus className="h-4 w-4" />
          Add Task
        </button>
      )}
    </div>
  );
}

function TaskFormModal({
  mode,
  task,
  onClose,
  onSaved,
  onError,
}: {
  mode: 'create' | 'edit';
  task?: Task;
  onClose: () => void;
  onSaved: (task: Task) => void;
  onError: (msg: string) => void;
}) {
  const isEdit = mode === 'edit';
  const [poc, setPoc] = useState(task?.poc ?? '');
  const [contactMethod, setContactMethod] = useState(task?.contact_method ?? '');
  const [taskNotes, setTaskNotes] = useState(task?.task_notes ?? '');
  const [status, setStatus] = useState<Task['status']>(task?.status ?? 'pending');
  const [estimatedMinutes, setEstimatedMinutes] = useState<number | null>(task?.estimated_minutes ?? null);
  const [priority, setPriority] = useState<Priority | null>(task?.priority ?? null);
  const [dueDate, setDueDate] = useState<string>(task?.due_date ?? '');
  const [submitting, setSubmitting] = useState(false);

  const isValid = poc.trim() && contactMethod.trim() && taskNotes.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setSubmitting(true);

    const payload = {
      poc: poc.trim(),
      contact_method: contactMethod.trim(),
      task_notes: taskNotes.trim(),
      estimated_minutes: estimatedMinutes,
      priority,
      due_date: dueDate || null,
    };

    if (isEdit && task) {
      const statusChanged = status !== task.status;
      const completedAt =
        status === 'completed'
          ? statusChanged
            ? new Date().toISOString()
            : task.completed_at
          : null;

      const { data, error: updateError } = await supabase
        .from('tasks')
        .update({
          ...payload,
          status,
          completed_at: completedAt,
        })
        .eq('id', task.id)
        .select()
        .single();

      setSubmitting(false);
      if (updateError) {
        onError(updateError.message);
        return;
      }
      onSaved(data as Task);
    } else {
      const { data, error: insertError } = await supabase
        .from('tasks')
        .insert({
          ...payload,
        })
        .select()
        .single();

      setSubmitting(false);
      if (insertError) {
        onError(insertError.message);
        return;
      }
      onSaved(data as Task);
    }
  };

  return (
    <ModalOverlay onClose={onClose}>
      <form onSubmit={handleSubmit} className="max-h-[85vh] overflow-y-auto p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'Edit Task' : 'Add Task'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <Field label="Point of Contact">
            <input
              type="text"
              value={poc}
              onChange={(e) => setPoc(e.target.value)}
              placeholder="e.g. SSG Johnson"
              autoFocus
              className="input-base"
            />
          </Field>

          <Field label="Contact Method">
            <select
              value={contactMethod}
              onChange={(e) => setContactMethod(e.target.value)}
              className="input-base"
            >
              <option value="">Select method…</option>
              <option value="Email">Email</option>
              <option value="Phone">Phone</option>
              <option value="In-person">In-person</option>
              <option value="Teams">Teams</option>
              <option value="Text">Text</option>
            </select>
          </Field>

          <Field label="Task Notes">
            <textarea
              value={taskNotes}
              onChange={(e) => setTaskNotes(e.target.value)}
              placeholder="Describe what needs to be done…"
              rows={4}
              className="input-base resize-none"
            />
          </Field>

          {/* Time estimate — quick-pick buttons */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-300">Time Estimate</span>
            <div className="flex gap-2">
              {TIME_OPTIONS.map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() =>
                    setEstimatedMinutes(estimatedMinutes === min ? null : min)
                  }
                  className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                    estimatedMinutes === min
                      ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
                      : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  {min}m
                </button>
              ))}
            </div>
          </div>

          {/* Priority — segmented control */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-300">Priority</span>
            <div className="flex gap-2">
              {(['high', 'medium', 'low'] as Priority[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setPriority(priority === p ? null : p)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm capitalize transition-colors ${
                    priority === p
                      ? `${PRIORITY_STYLES[p].badge} border-current`
                      : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${PRIORITY_STYLES[p].dot}`} />
                  {p}
                </button>
              ))}
            </div>
          </div>

          {/* Due date with clear button */}
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-300">Due Date</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="input-base flex-1"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  className="shrink-0 rounded-lg border border-slate-700 px-2.5 py-2 text-slate-400 transition-colors hover:border-slate-600 hover:text-slate-200"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Status — only in edit mode */}
          {isEdit && (
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as Task['status'])}
                className="input-base"
              >
                <option value="pending">Pending</option>
                <option value="waiting">Waiting</option>
                <option value="completed">Completed</option>
              </select>
            </Field>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isValid || submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-slate-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isEdit ? (
              <Check className="h-4 w-4" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {isEdit ? 'Save Changes' : 'Add Task'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <ModalOverlay onClose={onCancel}>
      <div className="p-5">
        <h2 className="mb-2 text-base font-semibold text-white">{title}</h2>
        <p className="mb-5 text-sm text-slate-400">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-400"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
}

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 backdrop-blur-sm sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}
