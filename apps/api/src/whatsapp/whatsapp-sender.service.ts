import { Injectable, Logger } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { chunkMessage } from '../common/utils/text.util';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export interface TemplateParameter {
  type: 'text';
  text: string;
}

/**
 * Sends messages through the Meta WhatsApp Cloud API.
 *
 * In dry-run mode (WHATSAPP_DRY_RUN=true) messages are logged instead of
 * sent, which makes local development possible without credentials.
 */
@Injectable()
export class WhatsappSenderService {
  private readonly logger = new Logger(WhatsappSenderService.name);

  constructor(private readonly config: AppConfigService) {}

  /** Sends a plain text message, splitting it when it exceeds the size limit. */
  async sendText(toPhone: string, text: string): Promise<void> {
    for (const chunk of chunkMessage(text)) {
      await this.post({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toPhone,
        type: 'text',
        text: { preview_url: false, body: chunk },
      });
    }
  }

  /**
   * Sends a pre-approved template message. Required for bot-initiated
   * messages (e.g. reminders) outside Meta's 24-hour customer service window.
   */
  async sendTemplate(
    toPhone: string,
    templateName: string,
    languageCode: string,
    bodyParameters: TemplateParameter[],
  ): Promise<void> {
    await this.post({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toPhone,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: [{ type: 'body', parameters: bodyParameters }],
      },
    });
  }

  private async post(payload: Record<string, unknown>): Promise<void> {
    if (this.config.get('WHATSAPP_DRY_RUN')) {
      this.logger.log(`[dry-run] outgoing message: ${JSON.stringify(payload)}`);
      return;
    }

    const phoneNumberId = this.config.get('WHATSAPP_PHONE_NUMBER_ID');
    const accessToken = this.config.get('WHATSAPP_ACCESS_TOKEN');
    if (!phoneNumberId || !accessToken) {
      throw new Error('WhatsApp credentials are not configured');
    }

    const response = await fetch(`${GRAPH_API_BASE}/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      // Response bodies from Meta do not contain our credentials; safe to log
      const body = await response.text().catch(() => '');
      throw new Error(`WhatsApp send failed with status ${response.status}: ${body}`);
    }
  }
}
