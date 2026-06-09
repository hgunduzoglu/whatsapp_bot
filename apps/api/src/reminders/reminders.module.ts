import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AppConfigService } from '../config/app-config.service';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { parseRedisUrl, REMINDERS_QUEUE } from './reminders.constants';
import { RemindersProcessor } from './reminders.processor';
import { RemindersService } from './reminders.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        connection: parseRedisUrl(config.get('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({ name: REMINDERS_QUEUE }),
    WhatsappModule,
  ],
  providers: [RemindersService, RemindersProcessor],
  exports: [RemindersService],
})
export class RemindersModule {}
