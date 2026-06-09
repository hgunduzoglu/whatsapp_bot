import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Env } from './env.validation';

/**
 * Typed access to validated environment configuration.
 */
@Injectable()
export class AppConfigService {
  constructor(private readonly config: ConfigService<Env, true>) {}

  get<K extends keyof Env>(key: K): Env[K] {
    return this.config.get(key, { infer: true });
  }

  get authorizedPhones(): string[] {
    return this.get('AUTHORIZED_WHATSAPP_PHONES')
      .split(',')
      .map((phone) => phone.trim())
      .filter((phone) => phone.length > 0);
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}
