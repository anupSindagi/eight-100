'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { Task, TaskType, DailyMode, getTasks, createTask, updateTask, deleteTask } from '@/lib/pocketbase-services';

export default function TasksPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/signin');
    } else if (user) {
      loadTasks();
    }
  }, [user, authLoading, router]);

  const loadTasks = async () => {
    try {
      setLoading(true);
      const data = await getTasks(user!.id);
      setTasks(data);
    } catch (error: any) {
      // Ignore auto-cancellation errors
      if (error.message && !error.message.includes('autocancelled')) {
        console.error('Error loading tasks:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this task?')) return;
    try {
      await deleteTask(id);
      await loadTasks();
    } catch (error) {
      console.error('Error deleting task:', error);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium">
            ← Back
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Manage Tasks</h1>
          <button
            onClick={() => {
              setEditingTask(null);
              setShowForm(true);
            }}
            className="px-3 py-1.5 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Add Task
          </button>
        </div>
      </div>

      {/* Tasks List */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {showForm && (
          <TaskForm
            userId={user.id}
            task={editingTask}
            onClose={() => {
              setShowForm(false);
              setEditingTask(null);
            }}
            onSave={async () => {
              await loadTasks();
              setShowForm(false);
              setEditingTask(null);
            }}
          />
        )}

        {tasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <p className="text-gray-600 mb-4">No tasks yet.</p>
            <button
              onClick={() => setShowForm(true)}
              className="text-blue-600 hover:text-blue-700 font-medium"
            >
              Create your first task
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div key={task.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{task.name}</h3>
                      <span className={`px-2 py-0.5 text-xs font-medium rounded whitespace-nowrap ${
                        task.type === 'daily' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                      }`}>
                        {task.type}
                      </span>
                      {task.tag && (
                        <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded whitespace-nowrap">
                          {task.tag}
                        </span>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-gray-600 mb-2 line-clamp-2">{task.description}</p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                      {task.type === 'daily' && task.daily_mode && (
                        <span>Mode: <span className="font-medium">{task.daily_mode}</span></span>
                      )}
                      {task.unit && (
                        <span>Unit: <span className="font-medium">{task.unit}</span></span>
                      )}
                      {task.type === 'goal' && task.target && (
                        <span>Target: <span className="font-medium">{task.target} {task.unit || ''}</span></span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => {
                        setEditingTask(task);
                        setShowForm(true);
                      }}
                      className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-lg transition"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(task.id)}
                      className="px-3 py-1.5 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface TaskFormProps {
  userId: string;
  task: Task | null;
  onClose: () => void;
  onSave: () => void;
}

function TaskForm({ userId, task, onClose, onSave }: TaskFormProps) {
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');
  const [tag, setTag] = useState(task?.tag || '');
  const [type, setType] = useState<TaskType>(task?.type || 'daily');
  const [dailyMode, setDailyMode] = useState<DailyMode>(task?.daily_mode || 'checklist');
  const [target, setTarget] = useState(task?.target?.toString() || '');
  const [unit, setUnit] = useState(task?.unit || '');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const data: any = {
        name,
        type,
        user: userId
      };

      // Add optional fields
      if (description.trim()) {
        data.description = description.trim();
      }
      if (tag.trim()) {
        data.tag = tag.trim();
      }

      if (type === 'daily') {
        data.daily_mode = dailyMode;
        if (dailyMode === 'number' && unit) {
          data.unit = unit;
        }
      } else if (type === 'goal') {
        if (target) {
          data.target = parseFloat(target);
        }
        if (unit) {
          data.unit = unit;
        }
      }

      if (task) {
        await updateTask(task.id, data);
      } else {
        await createTask(data);
      }

      onSave();
    } catch (error) {
      console.error('Error saving task:', error);
      alert('Failed to save task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            {task ? 'Edit Task' : 'Create Task'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
              placeholder="Task name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white resize-none"
              placeholder="Optional task description"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tag
            </label>
            <input
              type="text"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
              placeholder="Optional tag (e.g., health, work, fitness)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as TaskType)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
            >
              <option value="daily">Daily Task</option>
              <option value="goal">Goal</option>
            </select>
          </div>

          {type === 'daily' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Mode
              </label>
              <select
                value={dailyMode}
                onChange={(e) => setDailyMode(e.target.value as DailyMode)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
              >
                <option value="checklist">Checklist</option>
                <option value="number">Number Log</option>
              </select>
            </div>
          )}

          {(type === 'daily' && dailyMode === 'number') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Unit (optional)
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
                placeholder="kg, hours, reps, etc."
              />
            </div>
          )}

          {type === 'goal' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Target
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
                  placeholder="Target value"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Unit (optional)
                </label>
                <input
                  type="text"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
                  placeholder="kg, hours, reps, etc."
                />
              </div>
            </>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : task ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

