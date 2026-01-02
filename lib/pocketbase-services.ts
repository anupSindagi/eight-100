import pb from './pocketbase';

// Task types
export type TaskType = 'daily' | 'goal';
export type DailyMode = 'checklist' | 'number';

// Helper to ensure user is authenticated
function ensureAuthenticated() {
  if (!pb.authStore.isValid || !pb.authStore.model) {
    throw new Error('User is not authenticated. Please sign in.');
  }
}

export interface Task {
  id: string;
  name: string;
  type: TaskType;
  daily_mode?: DailyMode;
  target?: number;
  unit?: string;
  user: string;
  created: string;
  updated: string;
  // Optional fields that may exist in PocketBase but not used by app
  description?: string;
  tag?: string;
}

export interface DailyLog {
  id: string;
  task: string;
  date: string;
  value_bool?: boolean;
  value_number?: number;
  note?: string;
  user: string;
  created: string;
  updated: string;
}

export interface GoalProgress {
  id: string;
  task: string;
  value: number;
  date: string;
  user: string;
  created: string;
  updated: string;
}

// Tasks
export async function getTasks(userId: string, type?: TaskType): Promise<Task[]> {
  ensureAuthenticated();
  
  // Build filter parts
  const filterParts: string[] = [];
  
  // Filter by user (relation field)
  filterParts.push(`user = "${userId}"`);
  
  // Filter by type if provided
  if (type) {
    filterParts.push(`type = "${type}"`);
  }
  
  const filter = filterParts.join(' && ');
  
  try {
    const records = await pb.collection('tasks').getList(1, 500, { filter, sort: '-created' });
    return records.items as any;
  } catch (error: any) {
    // Handle auto-cancellation (not a real error, just duplicate request prevention)
    if (error.message && error.message.includes('autocancelled')) {
      // Return empty array for cancelled requests - the other request will succeed
      return [];
    }
    
    console.error('PocketBase error details:', {
      status: error.status,
      message: error.message,
      response: error.response,
      data: error.data
    });
    
    if (error.status === 400) {
      const errorMsg = error.data?.message || error.message || error;
      throw new Error(`Invalid filter syntax. Error: ${errorMsg}. Filter used: ${filter}. Please check that the 'user' and 'type' fields exist in the tasks collection.`);
    }
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules. The "tasks" collection should allow authenticated users to read their own records.');
    }
    const errorMsg = error.data?.message || error.message || error;
    throw new Error(`Failed to fetch tasks: ${errorMsg}`);
  }
}

export async function createTask(data: Partial<Task>): Promise<Task> {
  ensureAuthenticated();
  try {
    const record = await pb.collection('tasks').create(data);
    return record as any;
  } catch (error: any) {
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw error;
  }
}

export async function updateTask(id: string, data: Partial<Task>): Promise<Task> {
  ensureAuthenticated();
  try {
    const record = await pb.collection('tasks').update(id, data);
    return record as any;
  } catch (error: any) {
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw error;
  }
}

export async function deleteTask(id: string): Promise<boolean> {
  ensureAuthenticated();
  try {
    await pb.collection('tasks').delete(id);
    return true;
  } catch (error: any) {
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw error;
  }
}

// Daily Logs
export async function getDailyLogs(userId: string, taskId?: string, date?: string): Promise<DailyLog[]> {
  ensureAuthenticated();
  
  const filterParts: string[] = [`user = "${userId}"`];
  if (taskId) filterParts.push(`task = "${taskId}"`);
  
  // For date filtering, we need to handle date range since PocketBase might store with time
  // We'll filter by date range: date >= YYYY-MM-DD 00:00:00 AND date < YYYY-MM-DD+1 00:00:00
  if (date) {
    const normalizedDate = normalizeDate(date);
    const nextDate = new Date(normalizedDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    filterParts.push(`date >= "${normalizedDate}" && date < "${nextDateStr}"`);
  }
  
  const filter = filterParts.join(' && ');
  
  try {
    const records = await pb.collection('daily_logs').getList(1, 500, { filter, sort: '-date' });
    
    // If date was specified, also filter in memory to ensure exact date match (normalized)
    if (date) {
      const normalizedDate = normalizeDate(date);
      return records.items.filter((item: any) => {
        const itemDate = normalizeDate(item.date);
        return itemDate === normalizedDate;
      }) as any;
    }
    
    return records.items as any;
  } catch (error: any) {
    // Handle auto-cancellation
    if (error.message && error.message.includes('autocancelled')) {
      return [];
    }
    if (error.status === 400) {
      throw new Error(`Invalid filter syntax: ${error.message || error}. Please check that the fields exist in the daily_logs collection.`);
    }
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw new Error(`Failed to fetch daily logs: ${error.message || error}`);
  }
}

export async function getDailyLogByTaskAndDate(userId: string, taskId: string, date: string): Promise<DailyLog | null> {
  ensureAuthenticated();
  const normalizedDate = normalizeDate(date);
  
  // Use date range filter to handle time component
  const nextDate = new Date(normalizedDate);
  nextDate.setDate(nextDate.getDate() + 1);
  const nextDateStr = nextDate.toISOString().split('T')[0];
  const filter = `user = "${userId}" && task = "${taskId}" && date >= "${normalizedDate}" && date < "${nextDateStr}"`;
  
  // Try up to 3 times to handle auto-cancellation
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const records = await pb.collection('daily_logs').getList(1, 10, { filter });
      
      // Filter in memory to get exact date match (normalized)
      const matchingLog = records.items.find((item: any) => {
        const itemDate = normalizeDate(item.date);
        return itemDate === normalizedDate;
      });
      
      return matchingLog as any || null;
    } catch (error: any) {
      // Handle auto-cancellation with retry
      if (error.message && error.message.includes('autocancelled')) {
        if (attempt < 2) {
          // Wait before retry (increasing delay)
          await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
          continue; // Retry
        } else {
          // Last attempt failed, return null
          return null;
        }
      }
      
      // For other errors, throw immediately
      if (error.status === 400) {
        throw new Error(`Invalid filter syntax: ${error.message || error}. Please check that the fields exist in the daily_logs collection.`);
      }
      if (error.status === 403) {
        throw new Error('Access denied. Please check your PocketBase collection rules.');
      }
      throw new Error(`Failed to fetch daily log: ${error.message || error}`);
    }
  }
  
  return null; // Should never reach here, but TypeScript needs it
}

// Normalize date to YYYY-MM-DD format (no time)
export function normalizeDate(date: string): string {
  if (date.includes('T')) {
    return date.split('T')[0];
  }
  return date;
}

// Create missing daily logs for tasks on a given date
export async function ensureDailyLogsExist(userId: string, tasks: Task[], date: string): Promise<void> {
  ensureAuthenticated();
  
  if (tasks.length === 0) {
    return; // Nothing to create
  }
  
  // Normalize date to YYYY-MM-DD (no time component)
  const normalizedDate = normalizeDate(date);
  
  // Fetch all existing logs for this date in one query (more efficient)
  let existingLogs: DailyLog[] = [];
  try {
    existingLogs = await getDailyLogs(userId, undefined, normalizedDate);
  } catch (error: any) {
    // If fetch fails, we'll try to create anyway (might be auto-cancellation)
    if (!error.message?.includes('autocancelled')) {
      console.warn('Failed to fetch existing logs, will attempt individual checks:', error.message || error);
    }
  }
  
  // Create a set of task IDs that already have logs
  const existingTaskIds = new Set(
    existingLogs
      .filter(log => normalizeDate(log.date) === normalizedDate)
      .map(log => log.task)
  );
  
  // Find tasks that need logs created
  const tasksNeedingLogs = tasks.filter(task => !existingTaskIds.has(task.id));
  
  // Create logs for missing tasks (one at a time to avoid race conditions)
  for (const task of tasksNeedingLogs) {
    try {
      // Double-check this specific task doesn't have a log (handle race conditions)
      let existing: DailyLog | null = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          existing = await getDailyLogByTaskAndDate(userId, task.id, normalizedDate);
          if (existing) break;
        } catch (checkError: any) {
          if (checkError.message?.includes('autocancelled') && attempt < 1) {
            await new Promise(resolve => setTimeout(resolve, 300));
            continue;
          }
          break;
        }
      }
      
      // If log exists, skip creating
      if (existing) {
        continue;
      }
      
      // Log doesn't exist, create it
      // Use full ISO date string for PocketBase
      const dateObj = new Date(normalizedDate + 'T00:00:00.000Z');
      const isoDateString = dateObj.toISOString();
      
      const logData: any = {
        task: task.id,
        date: isoDateString, // Use ISO string format for PocketBase
        user: userId,
        value_bool: false // Default to unchecked
      };
      
      await pb.collection('daily_logs').create(logData);
    } catch (error: any) {
      // Extract error details
      const errorData = error?.response?.data?.data || error?.data?.data || error?.data;
      const errorMessage = error?.response?.data?.message || error?.data?.message || error?.message;
      
      // Check for unique constraint error - check multiple possible formats
      const hasUniqueError = 
        (errorData && (
          errorData.date?.code === 'validation_not_unique' ||
          errorData.task?.code === 'validation_not_unique' ||
          errorData.user?.code === 'validation_not_unique' ||
          (typeof errorData === 'object' && Object.values(errorData).some((v: any) => 
            v?.code === 'validation_not_unique' || v?.message?.includes('unique')
          ))
        )) ||
        errorMessage?.toLowerCase().includes('unique') ||
        errorMessage?.toLowerCase().includes('already exists');
      
      // If it's a 400 error with errorData, it's likely a validation/unique constraint error
      // Since we have a unique index on (task, date, user), any 400 during create is likely a duplicate
      if (hasUniqueError || (error?.status === 400 && errorData)) {
        // Record already exists, skip silently - this is expected behavior
        // (record was created by another request or our check missed it due to timing/auto-cancellation)
        // Note: Browser console may still show the 400 error from the network request, but it's harmless
        continue;
      }
      
      // For other errors (non-400 or 400 without data), log but don't throw
      console.warn(`[ensureDailyLogsExist] Unexpected error creating log for task ${task.id}:`, {
        error: errorMessage || error.message || error,
        errorData,
        status: error?.status
      });
    }
  }
}

// Create a single daily log if it doesn't exist
// Returns null if record exists but could not be retrieved (caller should reload data)
export async function createDailyLogIfNeeded(userId: string, taskId: string, date: string): Promise<DailyLog | null> {
  ensureAuthenticated();
  
  // Normalize date to YYYY-MM-DD (no time)
  const normalizedDate = normalizeDate(date);
  
  // Check if log exists - try multiple times to handle auto-cancellation
  let existing: DailyLog | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      existing = await getDailyLogByTaskAndDate(userId, taskId, normalizedDate);
      if (existing) break;
    } catch (checkError: any) {
      if (checkError.message?.includes('autocancelled') && attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 200 * (attempt + 1)));
        continue;
      }
    }
    if (existing) break;
  }
  
  if (existing) {
    return existing;
  }
  
  // Create new log - use full ISO date string for PocketBase
  const dateObj = new Date(normalizedDate + 'T00:00:00.000Z');
  const isoDateString = dateObj.toISOString();
  
  const logData: any = {
    task: taskId,
    date: isoDateString, // Use ISO string format for PocketBase
    user: userId,
    value_bool: false
  };
  
  try {
    const record = await pb.collection('daily_logs').create(logData);
    return record as any;
  } catch (error: any) {
    // If unique constraint error, record exists - fetch it
    const errorData = error?.response?.data?.data || error?.data?.data || error?.data;
    const hasUniqueError = errorData && (
      errorData.date?.code === 'validation_not_unique' ||
      errorData.task?.code === 'validation_not_unique' ||
      errorData.user?.code === 'validation_not_unique'
    );
    
    if (hasUniqueError || (error?.status === 400 && errorData)) {
      // Record exists - wait a bit and try multiple ways to fetch it
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Try to fetch the existing record multiple times using getDailyLogByTaskAndDate
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const record = await getDailyLogByTaskAndDate(userId, taskId, normalizedDate);
          if (record) {
            return record;
          }
        } catch (fetchError: any) {
          if (fetchError.message?.includes('autocancelled') && attempt < 2) {
            await new Promise(resolve => setTimeout(resolve, 300));
            continue;
          }
        }
      }
      
      // If getDailyLogByTaskAndDate failed, try fetching all logs and filtering in memory
      try {
        const allLogs = await getDailyLogs(userId);
        const matchingLog = allLogs.find(log => {
          const logDate = normalizeDate(log.date);
          return log.task === taskId && logDate === normalizedDate;
        });
        if (matchingLog) {
          return matchingLog;
        }
      } catch (fetchAllError: any) {
        // If this also fails, the record exists but we can't retrieve it
        // Return null and let the caller handle it (they can reload data)
        console.warn('Record exists but could not be retrieved. Caller should reload data.');
        return null as any; // Return null to indicate record exists but couldn't be fetched
      }
      
      // If we still can't find it, return null - record exists but query is failing
      // The caller should reload data to get the record
      return null as any;
    }
    
    // For other errors, extract and throw detailed message
    let errorMsg = 'Failed to create record.';
    if (errorData) {
      if (errorData.message) {
        errorMsg = errorData.message;
      } else if (typeof errorData === 'string') {
        errorMsg = errorData;
      } else {
        const fieldErrors: string[] = [];
        for (const key in errorData) {
          if (errorData[key] && typeof errorData[key] === 'object') {
            fieldErrors.push(`${key}: ${JSON.stringify(errorData[key])}`);
          }
        }
        if (fieldErrors.length > 0) {
          errorMsg = fieldErrors.join(', ');
        }
      }
    }
    
    throw new Error(errorMsg);
  }
}

// Simple update function - assumes record exists
export async function updateDailyLog(logId: string, data: Partial<DailyLog>): Promise<DailyLog> {
  ensureAuthenticated();
  
  const cleanData: any = {};
  
  // Only include fields that are provided
  if (data.value_bool !== undefined && data.value_bool !== null) {
    cleanData.value_bool = data.value_bool;
  }
  if (data.value_number !== undefined && data.value_number !== null) {
    cleanData.value_number = data.value_number;
  }
  if (data.note !== undefined && data.note !== null && data.note !== '') {
    cleanData.note = data.note;
  }
  
  try {
    const record = await pb.collection('daily_logs').update(logId, cleanData);
    return record as any;
  } catch (error: any) {
    if (error.status === 400) {
      throw new Error(`Failed to update: ${error.data?.message || error.message || error}`);
    }
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw new Error(`Failed to update daily log: ${error.message || error}`);
  }
}

export async function deleteDailyLog(id: string): Promise<boolean> {
  ensureAuthenticated();
  try {
    await pb.collection('daily_logs').delete(id);
    return true;
  } catch (error: any) {
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw error;
  }
}

// Goal Progress
export async function getGoalProgress(userId: string, taskId?: string): Promise<GoalProgress[]> {
  ensureAuthenticated();
  
  const filterParts: string[] = [`user = "${userId}"`];
  if (taskId) filterParts.push(`task = "${taskId}"`);
  
  const filter = filterParts.join(' && ');
  
  try {
    const records = await pb.collection('goal_progress').getList(1, 500, { filter, sort: '-date' });
    return records.items as any;
  } catch (error: any) {
    // Handle auto-cancellation
    if (error.message && error.message.includes('autocancelled')) {
      return [];
    }
    if (error.status === 400) {
      throw new Error(`Invalid filter syntax: ${error.message || error}. Please check that the fields exist in the goal_progress collection.`);
    }
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw new Error(`Failed to fetch goal progress: ${error.message || error}`);
  }
}

export async function createOrUpdateGoalProgress(data: Partial<GoalProgress>): Promise<GoalProgress> {
  ensureAuthenticated();
  const { task, date, user } = data;
  
  try {
    // Check if progress exists for this task and date
    const filter = `user = "${user}" && task = "${task}" && date = "${date}"`;
    const records = await pb.collection('goal_progress').getList(1, 1, { filter });
    
    if (records.items[0]) {
      const record = await pb.collection('goal_progress').update(records.items[0].id, data);
      return record as any;
    } else {
      const record = await pb.collection('goal_progress').create(data);
      return record as any;
    }
  } catch (error: any) {
    if (error.status === 403) {
      throw new Error('Access denied. Please check your PocketBase collection rules.');
    }
    throw error;
  }
}


