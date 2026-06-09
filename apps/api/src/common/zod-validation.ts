import { BadRequestException } from '@nestjs/common';
import { ZodType } from 'zod';

/** Validates a request body against a Zod schema, throwing a 400 on failure. */
export function zParse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`)
      .join('; ');
    throw new BadRequestException(details);
  }
  return result.data;
}
