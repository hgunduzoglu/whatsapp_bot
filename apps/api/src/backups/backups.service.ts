import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Backup, BackupStatus } from '@prisma/client';
import { Queue } from 'bullmq';
import { execFile } from 'child_process';
import { readFile, unlink } from 'fs/promises';
import { promisify } from 'util';
import { nowInIstanbul } from '../common/utils/date.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { BACKUPS_QUEUE, RUN_BACKUP_JOB } from './backups.constants';

const execFileAsync = promisify(execFile);

/** How many backups to keep per cadence prefix. */
const RETENTION: Record<string, number> = {
  daily: 7,
  weekly: 4,
  monthly: 12,
};

/**
 * Dumps PostgreSQL with pg_dump and uploads the archive to an S3-compatible
 * bucket (Cloudflare R2). Disabled until the R2_* variables are configured.
 */
@Injectable()
export class BackupsService implements OnModuleInit {
  private readonly logger = new Logger(BackupsService.name);
  private s3Client: S3Client | null = null;

  constructor(
    @InjectQueue(BACKUPS_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.config.isBackupConfigured) {
      this.logger.warn('R2 credentials are not set; database backups are disabled');
      return;
    }
    try {
      await this.queue.upsertJobScheduler(
        'backup-schedule',
        { pattern: this.config.get('BACKUP_CRON'), tz: 'Europe/Istanbul' },
        { name: RUN_BACKUP_JOB, data: { trigger: 'SCHEDULED' } },
      );
    } catch (error) {
      this.logger.error(`Could not register backup schedule: ${(error as Error).message}`);
    }
  }

  get isConfigured(): boolean {
    return this.config.isBackupConfigured;
  }

  async list(limit = 50): Promise<Backup[]> {
    return this.prisma.backup.findMany({ orderBy: { createdAt: 'desc' }, take: limit });
  }

  async enqueueManualRun(): Promise<void> {
    await this.queue.add(RUN_BACKUP_JOB, { trigger: 'MANUAL' });
  }

  async run(trigger: 'SCHEDULED' | 'MANUAL'): Promise<Backup> {
    if (!this.isConfigured) {
      throw new Error('Backups are not configured (set the R2_* environment variables)');
    }

    const now = nowInIstanbul();
    const fileName = `whatsapp-crm-${now.toFormat('yyyy-MM-dd_HHmm')}.dump`;
    const localPath = `/tmp/${fileName}`;

    const backup = await this.prisma.backup.create({ data: { fileName, trigger } });

    try {
      await this.pgDump(localPath);
      const body = await readFile(localPath);

      // Every run is a daily backup; Mondays and the 1st of the month also
      // copy it into the weekly/monthly buckets so retention can differ.
      const prefixes = ['daily'];
      if (now.weekday === 1) {
        prefixes.push('weekly');
      }
      if (now.day === 1) {
        prefixes.push('monthly');
      }

      for (const prefix of prefixes) {
        await this.s3().send(
          new PutObjectCommand({
            Bucket: this.config.get('R2_BUCKET_NAME'),
            Key: `backups/${prefix}/${fileName}`,
            Body: body,
            ContentType: 'application/octet-stream',
          }),
        );
        await this.applyRetention(prefix);
      }

      const finished = await this.prisma.backup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.SUCCESS,
          sizeBytes: body.byteLength,
          finishedAt: new Date(),
        },
      });
      this.logger.log(`Backup ${fileName} uploaded (${body.byteLength} bytes)`);
      return finished;
    } catch (error) {
      await this.prisma.backup.update({
        where: { id: backup.id },
        data: {
          status: BackupStatus.FAILED,
          errorMessage: (error as Error).message,
          finishedAt: new Date(),
        },
      });
      throw error;
    } finally {
      await unlink(localPath).catch(() => undefined);
    }
  }

  private async pgDump(outputPath: string): Promise<void> {
    // Prisma appends ?schema=...; pg_dump does not understand that parameter
    const databaseUrl = (process.env.DATABASE_URL ?? '').split('?')[0];
    if (!databaseUrl) {
      throw new Error('DATABASE_URL is not set');
    }
    await execFileAsync('pg_dump', [
      '--format=custom',
      `--dbname=${databaseUrl}`,
      `--file=${outputPath}`,
    ]);
  }

  /** Deletes the oldest objects beyond the retention count of a prefix. */
  private async applyRetention(prefix: string): Promise<void> {
    const keep = RETENTION[prefix] ?? 7;
    const bucket = this.config.get('R2_BUCKET_NAME');

    const listed = await this.s3().send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: `backups/${prefix}/` }),
    );
    const objects = (listed.Contents ?? [])
      .filter((object) => object.Key)
      .sort((a, b) => (b.LastModified?.getTime() ?? 0) - (a.LastModified?.getTime() ?? 0));

    const excess = objects.slice(keep);
    if (excess.length === 0) {
      return;
    }

    await this.s3().send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: excess.map((object) => ({ Key: object.Key })) },
      }),
    );
    this.logger.log(`Retention removed ${excess.length} old ${prefix} backup(s)`);
  }

  private s3(): S3Client {
    if (!this.s3Client) {
      this.s3Client = new S3Client({
        region: 'auto',
        endpoint: this.config.get('R2_ENDPOINT'),
        credentials: {
          accessKeyId: this.config.get('R2_ACCESS_KEY_ID'),
          secretAccessKey: this.config.get('R2_SECRET_ACCESS_KEY'),
        },
      });
    }
    return this.s3Client;
  }
}
