import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from './jwt-auth.guard';

/** Injects the JWT payload of the authenticated admin user. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): JwtPayload => {
    const request = context.switchToHttp().getRequest<{ user: JwtPayload }>();
    return request.user;
  },
);

/**
 * Audit identity for admin-panel actions, stored in the same actor column
 * as WhatsApp phone numbers (prefixed so the two are distinguishable).
 */
export function adminActor(user: JwtPayload): string {
  return `admin:${user.email}`;
}
