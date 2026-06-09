import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { z } from 'zod';
import { zParse } from '../common/zod-validation';
import { AuthService, LoginResult } from './auth.service';
import { JwtPayload } from './jwt-auth.guard';
import { Public } from './public.decorator';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() body: unknown): Promise<LoginResult> {
    const { email, password } = zParse(loginSchema, body);
    return this.auth.login(email, password);
  }

  @Get('me')
  async me(@Req() request: Request & { user: JwtPayload }): Promise<LoginResult['user']> {
    return this.auth.me(request.user.sub);
  }
}
