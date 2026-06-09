export const REMINDERS_QUEUE = 'reminders';

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
