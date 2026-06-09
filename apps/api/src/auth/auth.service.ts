import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

export interface LoginResult {
  accessToken: string;
  user: { id: string; name: string; email: string; role: UserRole };
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Seeds the initial owner account from ADMIN_EMAIL / ADMIN_PASSWORD.
   * Runs on every boot but only creates the user when it does not exist yet.
   */
  async onModuleInit(): Promise<void> {
    const email = this.config.get('ADMIN_EMAIL');
    const password = this.config.get('ADMIN_PASSWORD');
    if (!email || !password) {
      return;
    }

    const existing = await this.prisma.appUser.findUnique({ where: { email } });
    if (existing) {
      return;
    }

    await this.prisma.appUser.create({
      data: {
        name: 'Owner',
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.OWNER,
      },
    });
    this.logger.log(`Seeded initial owner account for ${email}`);
  }

  async login(email: string, password: string): Promise<LoginResult> {
    if (!this.config.get('JWT_SECRET')) {
      throw new UnauthorizedException('Authentication is not configured');
    }

    const user = await this.prisma.appUser.findUnique({ where: { email } });
    if (!user || !user.isActive || user.deletedAt !== null || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });

    return {
      accessToken,
      user: { id: user.id, name: user.name, email: user.email ?? email, role: user.role },
    };
  }

  async me(userId: string): Promise<LoginResult['user']> {
    const user = await this.prisma.appUser.findUniqueOrThrow({ where: { id: userId } });
    return { id: user.id, name: user.name, email: user.email ?? '', role: user.role };
  }
}
