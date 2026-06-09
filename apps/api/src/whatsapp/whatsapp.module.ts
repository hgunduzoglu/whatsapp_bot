import { Module } from '@nestjs/common';
import { WhatsappController } from './whatsapp.controller';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { WhatsappWebhookService } from './whatsapp-webhook.service';

@Module({
  controllers: [WhatsappController],
  providers: [WhatsappSenderService, WhatsappWebhookService],
  exports: [WhatsappSenderService],
})
export class WhatsappModule {}
