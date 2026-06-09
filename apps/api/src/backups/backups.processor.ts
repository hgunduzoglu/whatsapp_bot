import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { BACKUPS_QUEUE, RUN_BACKUP_JOB } from './backups.constants';
import { BackupsService } from './backups.service';

@Processor(BACKUPS_QUEUE)
export class BackupsProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupsProcessor.name);

  constructor(private readonly backups: BackupsService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== RUN_BACKUP_JOB) {
      return;
    }
    const trigger = (job.data as { trigger?: 'SCHEDULED' | 'MANUAL' }).trigger ?? 'SCHEDULED';
    try {
      await this.backups.run(trigger);
    } catch (error) {
      // The failure is already recorded on the Backup row
      this.logger.error(`Backup run failed: ${(error as Error).message}`);
    }
  }
}
