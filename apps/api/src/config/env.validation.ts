import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  APP_TIMEZONE: z.string().default('Europe/Istanbul'),

  WHATSAPP_ACCESS_TOKEN: z.string().default(''),
  WHATSAPP_VERIFY_TOKEN: z.string().default(''),
  WHATSAPP_PHONE_NUMBER_ID: z.string().default(''),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().default(''),
  WHATSAPP_APP_SECRET: z.string().default(''),
  // When true, outgoing messages are logged instead of being sent to Meta.
  WHATSAPP_DRY_RUN: booleanString,

  // Comma separated list of phone numbers allowed to use the bot, e.g. 905xxxxxxxxx
  AUTHORIZED_WHATSAPP_PHONES: z.string().default(''),
  // When false, unauthorized senders are silently ignored (recommended:
  // replying opens a paid conversation window with strangers).
  REPLY_TO_UNAUTHORIZED: booleanString,

  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(30),
  // Hour of day (Istanbul time) at which scheduled reminders are sent.
  REMINDER_SEND_HOUR: z.coerce.number().int().min(0).max(23).default(9),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return result.data;
}
