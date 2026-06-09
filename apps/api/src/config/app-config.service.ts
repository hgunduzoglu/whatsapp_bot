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

  get adminOrigins(): string[] {
    return this.get('ADMIN_ORIGINS')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0);
  }

  get isBackupConfigured(): boolean {
    return Boolean(
      this.get('R2_ACCESS_KEY_ID') &&
        this.get('R2_SECRET_ACCESS_KEY') &&
        this.get('R2_BUCKET_NAME') &&
        this.get('R2_ENDPOINT'),
    );
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }
}
