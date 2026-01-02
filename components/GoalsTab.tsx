'use client';

import { useEffect, useState } from 'react';
import { Task, GoalProgress, getTasks, getGoalProgress, createOrUpdateGoalProgress } from '@/lib/pocketbase-services';

interface GoalsTabProps {
  userId: string;
}

export default function GoalsTab({ userId }: GoalsTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [progress, setProgress] = useState<GoalProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [today] = useState(new Date().toISOString().split('T')[0]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [tasksData, progressData] = await Promise.all([
        getTasks(userId, 'goal'),
        getGoalProgress(userId)
      ]);
      
      setTasks(tasksData);
      setProgress(progressData);
    } catch (error: any) {
      // Ignore auto-cancellation errors
      if (error.message && !error.message.includes('autocancelled')) {
        console.error('Error loading data:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [userId]);

  const getProgressForTask = (taskId: string): number => {
    const taskProgress = progress.filter(p => p.task === taskId);
    if (taskProgress.length === 0) return 0;
    // Sum all progress entries for this task
    return taskProgress.reduce((sum, p) => sum + p.value, 0);
  };

  const getTodayProgress = (taskId: string): GoalProgress | null => {
    return progress.find(p => p.task === taskId && p.date === today) || null;
  };

  const handleProgressUpdate = async (task: Task, value: number) => {
    try {
      const todayProgress = getTodayProgress(task.id);
      const currentTodayValue = todayProgress?.value || 0;
      const newValue = currentTodayValue + value;
      
      await createOrUpdateGoalProgress({
        task: task.id,
        date: today,
        user: userId,
        value: newValue
      });
      await loadData();
    } catch (error) {
      console.error('Error updating progress:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">No goals yet.</p>
        <a href="/tasks" className="text-blue-600 hover:text-blue-700 font-medium">
          Create your first goal
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {tasks.map((task) => {
        const currentProgress = getProgressForTask(task.id);
        const target = task.target || 0;
        const percentage = target > 0 ? Math.min((currentProgress / target) * 100, 100) : 0;
        const isComplete = currentProgress >= target;

        return (
          <div key={task.id} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
            <div className="mb-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-gray-900">{task.name}</h3>
                    {task.tag && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded whitespace-nowrap">
                        {task.tag}
                      </span>
                    )}
                    {isComplete && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded whitespace-nowrap">
                        Complete
                      </span>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-gray-600 mb-2">{task.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold text-gray-900">{currentProgress}</span>
                {task.unit && (
                  <span className="text-sm text-gray-600">{task.unit}</span>
                )}
                <span className="text-gray-500">/</span>
                <span className="text-lg text-gray-700">{target}</span>
                {task.unit && (
                  <span className="text-sm text-gray-600">{task.unit}</span>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all ${
                    isComplete ? 'bg-green-600' : 'bg-blue-600'
                  }`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <p className="text-xs text-gray-600 mt-1">{percentage.toFixed(1)}% complete</p>
            </div>

            {!isComplete && (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  placeholder="Add progress"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.target as HTMLInputElement;
                      const value = parseFloat(input.value);
                      if (!isNaN(value) && value > 0) {
                        handleProgressUpdate(task, value);
                        input.value = '';
                      }
                    }
                  }}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
                />
                <button
                  onClick={(e) => {
                    const input = e.currentTarget.previousElementSibling as HTMLInputElement;
                    const value = parseFloat(input.value);
                    if (!isNaN(value) && value > 0) {
                      handleProgressUpdate(task, value);
                      input.value = '';
                    }
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition text-sm"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

