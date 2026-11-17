export const SUPERVISOR_ROLES = ['primary', 'co_supervisor', 'other'] as const;
export const MEETING_TYPES = ['in_person', 'online', 'hybrid'] as const;
export const MEETING_STATUSES = ['scheduled', 'completed', 'cancelled'] as const;
export const ACTION_PHASES = ['pre_meeting', 'post_meeting'] as const;
export const ACTION_STATUSES = ['pending', 'in_progress', 'completed'] as const;
export const TASK_REFERENCE = /^\d{4}-\d{2}-\d{2}:[a-z0-9][a-z0-9_-]{0,63}$/;
export const RECORD_ID = /^[a-f0-9]{24}$/;
