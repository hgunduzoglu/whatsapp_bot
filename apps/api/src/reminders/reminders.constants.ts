export const REMINDERS_QUEUE = 'reminders';

/** Meta-approved template names used when the 24h service window is closed. */
export const REMINDER_TEMPLATES: Record<string, string> = {
  PROMISSORY_NOTE_3_DAYS: 'promissory_note_due_reminder',
  PROMISSORY_NOTE_1_DAY: 'promissory_note_due_reminder',
  SEEDLING_PICKUP_3_DAYS: 'seedling_pickup_reminder',
};

export const REMINDER_TEMPLATE_LANGUAGE = 'tr';

export const SEND_REMINDER_JOB = 'send-reminder';
export const RECONCILE_JOB = 'reconcile';

export interface SendReminderJobData {
  reminderId: string;
}

/** Parses a redis:// URL into BullMQ/ioredis connection options. */
export function parseRedisUrl(url: string): {
  host: string;
  port: number;
  password?: string;
  db?: number;
} {
  const parsed = new URL(url);
  const db = parsed.pathname.replace('/', '');
  return {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    password: parsed.password || undefined,
    db: db ? Number(db) : undefined,
  };
}
