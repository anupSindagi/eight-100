# PocketBase Schema Documentation

This document describes the database schema for the eight-100 application.

## Collections Overview

The application uses three main collections:
1. `tasks` - Defines tasks that can be daily or goal-based
2. `daily_logs` - Tracks daily task completions and values
3. `goal_progress` - Tracks progress toward goal-based tasks

---

## 1. `tasks` Collection

**Type:** Base

### Fields

| Field Name | Type | Options | Description |
|------------|------|---------|-------------|
| `id` | Text | Nonempty | Primary key (auto-generated) |
| `name` | Text | - | Task name |
| `description` | Text/Textarea | - | Optional task description |
| `tag` | Text | - | Optional tag for categorization |
| `type` | Select | Options: `daily`, `goal`<br>Single select | Task type (daily or goal) |
| `target` | Number | - | Target value (for goal tasks) |
| `unit` | Text | - | Unit of measurement (e.g., "kg", "hours", "reps") |
| `user` | Relation | Related to: `users`<br>Single select | Owner of the task |
| `daily_mode` | Select | Options: `checklist`, `number`<br>Single select | Mode for daily tasks (checklist or numeric log) |
| `created` | Date/Time | Create | Auto-set on creation |
| `updated` | Date/Time | Create/Update | Auto-set on creation and update |

### Notes
- `type` determines if a task is a daily task or a goal
- `daily_mode` is only relevant for tasks where `type = "daily"`
- `target` is typically used for goal-type tasks

---

## 2. `daily_logs` Collection

**Type:** Base

### Fields

| Field Name | Type | Options | Description |
|------------|------|---------|-------------|
| `id` | Text | Nonempty | Primary key (auto-generated) |
| `task` | Relation | Related to: `tasks`<br>Single select | The task being logged |
| `value_bool` | Boolean | - | Checkbox value (for checklist tasks) |
| `value_number` | Number | - | Numeric value (for number tasks) |
| `note` | Text | - | Optional note |
| `user` | Relation | Related to: `users`<br>Single select | Owner of the log |
| `date` | Text | - | Date of the log (YYYY-MM-DD format) |
| `created` | Date/Time | Create | Auto-set on creation |
| `updated` | Date/Time | Create/Update | Auto-set on creation and update |

### Unique Constraints and Indexes

**Unique Index:** `(task, user, date)`
- Ensures only one log entry per task, user, and date combination
- Prevents duplicate daily logs for the same task on the same day

### Notes
- For checklist tasks (`daily_mode = "checklist"`): use `value_bool`
- For number tasks (`daily_mode = "number"`): use `value_number`
- The `date` field stores dates in `YYYY-MM-DD` format (as text)
- Both `value_bool` and `value_number` are optional, but at least one should be set based on task type

---

## 3. `goal_progress` Collection

**Type:** Base

### Fields

| Field Name | Type | Options | Description |
|------------|------|---------|-------------|
| `id` | Text | Nonempty | Primary key (auto-generated) |
| `task` | Relation | Related to: `tasks`<br>Single select | The goal task |
| `value` | Number | - | Progress value added |
| `date` | Date | - | Date when progress was made |
| `user` | Relation | Related to: `users`<br>Single select | Owner of the progress entry |
| `created` | Date/Time | Create | Auto-set on creation |
| `updated` | Date/Time | Create/Update | Auto-set on creation and update |

### Unique Constraints and Indexes

None currently defined.

### Notes
- Multiple progress entries can exist for the same task and date
- Progress values are cumulative (sum all entries to get total progress)
- Compare total progress to `task.target` to determine if goal is reached

---

## Relationships

```
users (1) ──< (many) tasks
users (1) ──< (many) daily_logs
users (1) ──< (many) goal_progress
tasks (1) ──< (many) daily_logs
tasks (1) ──< (many) goal_progress
```

---

## API Rules Recommendations

### `tasks` Collection
- **List/Search:** `user = @request.auth.id`
- **View:** `user = @request.auth.id`
- **Create:** `user = @request.auth.id`
- **Update:** `user = @request.auth.id`
- **Delete:** `user = @request.auth.id`

### `daily_logs` Collection
- **List/Search:** `user = @request.auth.id`
- **View:** `user = @request.auth.id`
- **Create:** `user = @request.auth.id`
- **Update:** `user = @request.auth.id`
- **Delete:** `user = @request.auth.id`

### `goal_progress` Collection
- **List/Search:** `user = @request.auth.id`
- **View:** `user = @request.auth.id`
- **Create:** `user = @request.auth.id`
- **Update:** `user = @request.auth.id`
- **Delete:** `user = @request.auth.id`

---

## Data Flow Examples

### Daily Checklist Task
1. Create task with `type = "daily"` and `daily_mode = "checklist"`
2. On each day, create/update `daily_logs` entry with `value_bool = true/false`

### Daily Number Task
1. Create task with `type = "daily"` and `daily_mode = "number"`
2. On each day, create/update `daily_logs` entry with `value_number = <value>`
3. Optionally set `value_bool = true` to mark as completed

### Goal Task
1. Create task with `type = "goal"` and set `target = <target_value>`
2. Add progress entries to `goal_progress` with `value = <increment>`
3. Sum all `goal_progress.value` for the task to get total progress
4. Compare total progress to `task.target` to check completion

---

## Notes

- The `date` field in `daily_logs` is stored as Text (not Date type) to ensure consistent `YYYY-MM-DD` format
- The unique index on `daily_logs` ensures data integrity and prevents duplicate entries
- All collections require the `user` relation to be set before API rules can be applied
- System fields (`id`, `created`, `updated`) are automatically managed by PocketBase

