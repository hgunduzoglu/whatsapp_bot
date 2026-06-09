import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BACKUPS_QUEUE } from './backups.constants';
import { BackupsController } from './backups.controller';
import { BackupsProcessor } from './backups.processor';
import { BackupsService } from './backups.service';

@Module({
  imports: [BullModule.registerQueue({ name: BACKUPS_QUEUE })],
  controllers: [BackupsController],
  providers: [BackupsService, BackupsProcessor],
  exports: [BackupsService],
})
export class BackupsModule {}
