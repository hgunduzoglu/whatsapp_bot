import { Injectable, Logger, Optional } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { BotDispatcher, WebhookMessage, WebhookPayload } from './whatsapp.types';

const UNAUTHORIZED_REPLY = 'Bu botu kullanma yetkiniz bulunmamaktadır.';
const UNSUPPORTED_TYPE_REPLY = 'Lütfen yazılı mesaj gönderiniz.';

/** Normalizes a phone to digits only: "+90 532..." -> "90532..." */
export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

@Injectable()
export class WhatsappWebhookService {
  private readonly logger = new Logger(WhatsappWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly sender: WhatsappSenderService,
    @Optional() private readonly botDispatcher?: BotDispatcher,
  ) {}

  /**
   * Processes a webhook payload. Designed to run after the HTTP 200 has been
   * returned to Meta — errors are recorded, never thrown to the caller.
   */
  async processPayload(payload: WebhookPayload): Promise<void> {
    const messages = this.extractMessages(payload);
    for (const message of messages) {
      try {
        await this.processMessage(message, payload);
      } catch (error) {
        this.logger.error(
          `Failed to process message ${message.id}: ${(error as Error).message}`,
        );
        await this.prisma.incomingWhatsappMessage
          .update({
            where: { whatsappMessageId: message.id },
            data: { processingError: (error as Error).message },
          })
          .catch(() => undefined);
      }
    }
  }

  private extractMessages(payload: WebhookPayload): WebhookMessage[] {
    const messages: WebhookMessage[] = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        messages.push(...(change.value?.messages ?? []));
      }
    }
    return messages;
  }

  private async processMessage(message: WebhookMessage, payload: WebhookPayload): Promise<void> {
    const fromPhone = normalizePhone(message.from);

    // Idempotency: WhatsApp may deliver the same message more than once.
    // The unique constraint on whatsappMessageId makes the second insert fail.
    try {
      await this.prisma.incomingWhatsappMessage.create({
        data: {
          whatsappMessageId: message.id,
          fromPhone,
          messageType: message.type,
          rawPayload: JSON.parse(JSON.stringify(payload)) as object,
        },
      });
    } catch {
      this.logger.warn(`Duplicate message ${message.id} ignored`);
      return;
    }

    const authorized = this.config.authorizedPhones.map(normalizePhone);
    if (!authorized.includes(fromPhone)) {
      this.logger.warn(`Unauthorized message from ${fromPhone}`);
      if (this.config.get('REPLY_TO_UNAUTHORIZED')) {
        await this.sender.sendText(fromPhone, UNAUTHORIZED_REPLY);
      }
      await this.markProcessed(message.id);
      return;
    }

    const text = this.extractText(message);
    if (text === null) {
      await this.sender.sendText(fromPhone, UNSUPPORTED_TYPE_REPLY);
      await this.markProcessed(message.id);
      return;
    }

    if (this.botDispatcher) {
      await this.botDispatcher.dispatch({ messageId: message.id, from: fromPhone, text });
    } else {
      this.logger.warn('No bot dispatcher registered; message stored but not handled');
    }
    await this.markProcessed(message.id);
  }

  private extractText(message: WebhookMessage): string | null {
    if (message.type === 'text') {
      const body = message.text?.body?.trim();
      return body && body.length > 0 ? body : null;
    }
    if (message.type === 'interactive') {
      const reply = message.interactive?.list_reply ?? message.interactive?.button_reply;
      const value = reply?.id ?? reply?.title;
      return value && value.trim().length > 0 ? value.trim() : null;
    }
    return null;
  }

  private async markProcessed(messageId: string): Promise<void> {
    await this.prisma.incomingWhatsappMessage.update({
      where: { whatsappMessageId: messageId },
      data: { processedAt: new Date() },
    });
  }
}
