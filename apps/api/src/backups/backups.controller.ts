import { BadRequestException, Controller, Get, Post } from '@nestjs/common';
import { Backup } from '@prisma/client';
import { BackupsService } from './backups.service';

@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  async list(): Promise<{ configured: boolean; items: Backup[] }> {
    return { configured: this.backups.isConfigured, items: await this.backups.list() };
  }

  @Post('run')
  async run(): Promise<{ started: true }> {
    if (!this.backups.isConfigured) {
      throw new BadRequestException('Backups are not configured (set the R2_* variables)');
    }
    await this.backups.enqueueManualRun();
    return { started: true };
  }
}
