import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RawBodyRequest } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import { Request } from 'express';
import { AppConfigService } from '../config/app-config.service';
import { WhatsappWebhookService } from './whatsapp-webhook.service';
import { WebhookPayload } from './whatsapp.types';

@Controller('webhooks/whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly webhookService: WhatsappWebhookService,
  ) {}

  /** Webhook verification handshake required by Meta. */
  @Get()
  verify(
    @Query('hub.mode') mode?: string,
    @Query('hub.verify_token') token?: string,
    @Query('hub.challenge') challenge?: string,
  ): string {
    const expected = this.config.get('WHATSAPP_VERIFY_TOKEN');
    if (mode === 'subscribe' && expected && token === expected && challenge) {
      return challenge;
    }
    throw new ForbiddenException('Webhook verification failed');
  }

  /**
   * Receives webhook events. Returns 200 immediately and processes the
   * payload asynchronously — Meta retries deliveries that do not get a
   * timely 2xx response.
   */
  @Post()
  @HttpCode(200)
  receive(@Req() request: RawBodyRequest<Request>, @Body() payload: WebhookPayload): { ok: true } {
    this.verifySignature(request);

    if (payload?.object !== 'whatsapp_business_account') {
      throw new BadRequestException('Unexpected payload');
    }

    setImmediate(() => {
      void this.webhookService.processPayload(payload);
    });

    return { ok: true };
  }

  /** Validates X-Hub-Signature-256 when an app secret is configured. */
  private verifySignature(request: RawBodyRequest<Request>): void {
    const appSecret = this.config.get('WHATSAPP_APP_SECRET');
    if (!appSecret) {
      if (this.config.isProduction) {
        this.logger.warn('WHATSAPP_APP_SECRET is not set; skipping signature verification');
      }
      return;
    }

    const signatureHeader = request.headers['x-hub-signature-256'];
    const rawBody = request.rawBody;
    if (typeof signatureHeader !== 'string' || !rawBody) {
      throw new ForbiddenException('Missing webhook signature');
    }

    const expected = `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
    const provided = Buffer.from(signatureHeader);
    const computed = Buffer.from(expected);
    if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
      throw new ForbiddenException('Invalid webhook signature');
    }
  }
}
