'use client';

import { useEffect, useState } from 'react';
import { Task, DailyLog, getTasks, getDailyLogs, ensureDailyLogsExist, updateDailyLog, createDailyLogIfNeeded, normalizeDate, getDailyLogByTaskAndDate } from '@/lib/pocketbase-services';

interface DailyTasksTabProps {
  userId: string;
}

export default function DailyTasksTab({ userId }: DailyTasksTabProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [loading, setLoading] = useState(true);
  // Store number input values locally (taskId-date -> value)
  const [numberInputValues, setNumberInputValues] = useState<Record<string, number | ''>>({});
  
  // Get today's date
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Step 1: Get all daily tasks
      const tasksData = await getTasks(userId, 'daily');
      setTasks(tasksData);
      
      // Step 2: Ensure daily logs exist for today only
      await ensureDailyLogsExist(userId, tasksData, todayStr);
      
      // Step 3: Get all logs for today
      const todayLogs = await getDailyLogs(userId, undefined, todayStr);
      
      // Set logs for today only
      setLogs(todayLogs);
      
      // Initialize number input values from logs
      const initialNumberValues: Record<string, number | ''> = {};
      todayLogs.forEach(log => {
        const key = `${log.task}-${normalizeDate(log.date)}`;
        if (log.value_number !== undefined && log.value_number !== null) {
          initialNumberValues[key] = log.value_number;
        }
      });
      setNumberInputValues(initialNumberValues);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  const getLogForTask = (taskId: string, date: string): DailyLog | null => {
    // Find log matching both task and date
    // Use normalizeDate for consistent date matching
    const normalizedTargetDate = normalizeDate(date);
    const log = logs.find(log => {
      const logDate = normalizeDate(log.date);
      return log.task === taskId && logDate === normalizedTargetDate;
    });
    return log || null;
  };

  const handleChecklistToggle = async (task: Task, date: string) => {
    // Ensure date is normalized
    const normalizedDate = normalizeDate(date);
    let existingLog = getLogForTask(task.id, normalizedDate);

    // If log doesn't exist, try to create it or get it
    if (!existingLog) {
      try {
        const createdLog = await createDailyLogIfNeeded(userId, task.id, normalizedDate);

        if (createdLog) {
          // Log was created successfully, use it directly
          existingLog = createdLog;
          // Also update state by reloading
          await loadData();
        } else {
          // createDailyLogIfNeeded returned null - record exists but couldn't be fetched
          // Try to fetch it directly using getDailyLogByTaskAndDate
          try {
            const fetchedLog = await getDailyLogByTaskAndDate(userId, task.id, normalizedDate);
            if (fetchedLog) {
              existingLog = fetchedLog;
              // Update state
              await loadData();
            }
          } catch (fetchError) {
            console.error('Direct fetch also failed:', fetchError);
          }

          // If still not found, wait and reload data multiple times
          if (!existingLog) {
            for (let attempt = 0; attempt < 3; attempt++) {
              await new Promise(resolve => setTimeout(resolve, 1000));
              await loadData();
              existingLog = getLogForTask(task.id, normalizedDate);
              if (existingLog) break;
            }
          }

          if (!existingLog) {
            console.error('Log not found after all attempts. Task:', task.id, 'Date:', date, 'Normalized:', normalizedDate);
            alert('Failed to create log. Please refresh the page and try again.');
            return;
          }
        }
      } catch (error: any) {
        console.error('Error creating log:', error);
        // Try reloading data multiple times - maybe the log was created by another request
        for (let attempt = 0; attempt < 3; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await loadData();
          existingLog = getLogForTask(task.id, normalizedDate);
          if (existingLog) break;
        }
        if (!existingLog) {
          alert('Failed to create log. Please try again.');
          return;
        }
      }
    }

    // Ensure existingLog is not null (should never happen at this point, but TypeScript needs it)
    if (!existingLog) {
      alert('Log not found. Please refresh the page and try again.');
      return;
    }

    const currentValue = existingLog.value_bool ?? false;
    const newValue = !currentValue;

    try {
      // Simple update - record exists now
      await updateDailyLog(existingLog.id, {
        value_bool: newValue
      });
      await loadData();
    } catch (error: any) {
      console.error('Error updating checklist:', error);
      alert(error.message || 'Failed to update checklist. Please try again.');
    }
  };

  // Update local state for number input (doesn't save to database)
  const handleNumberInputChange = (task: Task, date: string, value: number | '') => {
    const normalizedDate = normalizeDate(date);
    const key = `${task.id}-${normalizedDate}`;
    setNumberInputValues(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const handleNumberCheckboxToggle = async (task: Task, date: string) => {
    // Ensure date is normalized
    const normalizedDate = normalizeDate(date);
    const key = `${task.id}-${normalizedDate}`;
    let existingLog = getLogForTask(task.id, normalizedDate);
    
    // If log doesn't exist, try to create it or get it
    if (!existingLog) {
      try {
        const createdLog = await createDailyLogIfNeeded(userId, task.id, normalizedDate);
        
        if (createdLog) {
          // Log was created successfully, use it directly
          existingLog = createdLog;
          await loadData();
          existingLog = getLogForTask(task.id, normalizedDate);
        } else {
          // Record exists but couldn't be fetched - wait and reload
          await new Promise(resolve => setTimeout(resolve, 500));
          await loadData();
          existingLog = getLogForTask(task.id, normalizedDate);
          
          if (!existingLog) {
            await new Promise(resolve => setTimeout(resolve, 500));
            await loadData();
            existingLog = getLogForTask(task.id, normalizedDate);
          }
          
          if (!existingLog) {
            alert('Failed to create log. Please refresh the page and try again.');
            return;
          }
        }
      } catch (error: any) {
        console.error('Error creating log:', error);
        await new Promise(resolve => setTimeout(resolve, 500));
        await loadData();
        existingLog = getLogForTask(task.id, normalizedDate);
        if (!existingLog) {
          alert('Failed to create log. Please try again.');
          return;
        }
      }
    }

    // Ensure existingLog is not null (should never happen at this point, but TypeScript needs it)
    if (!existingLog) {
      alert('Log not found. Please refresh the page and try again.');
      return;
    }

    // Toggle value_bool between true and false
    const currentValue = existingLog.value_bool ?? false;
    const newValue = !currentValue;

    // Get the current number input value from local state
    const numberValue = numberInputValues[key];
    
    try {
      // Prepare update data
      const updateData: any = {
        value_bool: newValue
      };
      
      // If checking the box (newValue = true) and there's a number value, save it
      if (newValue && numberValue !== undefined && numberValue !== '') {
        updateData.value_number = typeof numberValue === 'number' ? numberValue : parseFloat(numberValue as string);
      }
      // If unchecking, keep the existing value_number in the database (don't clear it)
      
      // Update both value_bool and value_number (if provided)
      await updateDailyLog(existingLog.id, updateData);
      await loadData();
    } catch (error: any) {
      console.error('Error updating number task checkbox:', error);
      alert(error.message || 'Failed to update checkbox. Please try again.');
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
        <p className="text-gray-600 mb-4">No daily tasks yet.</p>
        <a href="/tasks" className="text-blue-600 hover:text-blue-700 font-medium">
          Create your first task
        </a>
      </div>
    );
  }

  const renderTaskForDate = (task: Task, date: string, dateLabel: string) => {
    // Normalize date for consistent matching
    const normalizedDate = normalizeDate(date);
    const log = getLogForTask(task.id, normalizedDate);
    const isChecklist = task.daily_mode === 'checklist';
    const isNumber = task.daily_mode === 'number';

    return (
      <div key={`${task.id}-${date}`} className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-sm transition-shadow">
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
                <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded whitespace-nowrap">
                  {dateLabel}
                </span>
              </div>
              {task.description && (
                <p className="text-sm text-gray-600 mb-2">{task.description}</p>
              )}
              {task.unit && (
                <p className="text-xs text-gray-500">Unit: {task.unit}</p>
              )}
            </div>
          </div>
        </div>

        {isChecklist && (
          <div className="flex items-center">
            <button
              onClick={() => handleChecklistToggle(task, normalizedDate)}
              className={`flex items-center justify-center w-6 h-6 rounded border-2 transition ${
                log?.value_bool === true
                  ? 'bg-blue-600 border-blue-600'
                  : 'border-gray-300 hover:border-blue-500'
              }`}
            >
              {log?.value_bool === true && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            <span className="ml-3 text-sm text-gray-700">
              {log?.value_bool === true ? 'Completed' : 'Not completed'}
            </span>
          </div>
        )}

        {isNumber && (
          <div className="space-y-3">
            {/* Checkbox - mandatory for number tasks */}
            <div className="flex items-center">
              <button
                onClick={() => handleNumberCheckboxToggle(task, normalizedDate)}
                className={`flex items-center justify-center w-6 h-6 rounded border-2 transition ${
                  log?.value_bool === true
                    ? 'bg-blue-600 border-blue-600'
                    : 'border-gray-300 hover:border-blue-500'
                }`}
              >
                {log?.value_bool === true && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
              <span className="ml-3 text-sm text-gray-700">
                {log?.value_bool === true ? 'Completed' : 'Not completed'}
              </span>
            </div>

            {/* Number input - only saves when checkbox is checked */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={numberInputValues[`${task.id}-${normalizedDate}`] ?? log?.value_number ?? ''}
                  onChange={(e) => {
                    const inputValue = e.target.value;
                    const numValue = inputValue === '' ? '' : parseFloat(inputValue);
                    handleNumberInputChange(task, normalizedDate, numValue);
                  }}
                  placeholder="Enter value"
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm sm:text-base text-gray-900 bg-white"
                />
                {task.unit && (
                  <span className="text-sm text-gray-600">{task.unit}</span>
                )}
              </div>
              {log?.value_number !== undefined && log?.value_number !== null && (
                <p className="text-sm text-gray-600">
                  Saved: {log.value_number} {task.unit || ''}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Today's Tasks */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Today ({todayStr})</h2>
        <div className="space-y-4">
          {tasks.length === 0 ? (
            <div className="text-center py-8 bg-white rounded-lg border border-gray-200">
              <p className="text-gray-600 mb-4">No daily tasks yet.</p>
              <a href="/tasks" className="text-blue-600 hover:text-blue-700 font-medium">
                Create your first task
              </a>
            </div>
          ) : (
            tasks.map((task) => renderTaskForDate(task, todayStr, 'Today'))
          )}
        </div>
      </div>
    </div>
  );
}

