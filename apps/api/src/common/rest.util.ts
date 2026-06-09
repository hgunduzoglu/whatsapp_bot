import { z } from 'zod';

/** "YYYY-MM-DD" string -> UTC-midnight Date (business date convention). */
export const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
  .transform((value) => new Date(`${value}T00:00:00Z`));

export const positiveInt = z.number().int().positive();

/** Pagination query helpers. */
export const takeQuery = z.coerce.number().int().min(1).max(200).default(50);
export const skipQuery = z.coerce.number().int().min(0).default(0);
