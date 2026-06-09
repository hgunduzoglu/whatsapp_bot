import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PromissoryNote, Reminder, ReminderStatus, ReminderType, SeedlingOrder } from '@prisma/client';
import { Queue } from 'bullmq';
import { reminderInstant } from '../common/utils/date.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  RECONCILE_JOB,
  REMINDERS_QUEUE,
  SEND_REMINDER_JOB,
  SendReminderJobData,
} from './reminders.constants';

/**
 * Creates reminder records and schedules their delivery through BullMQ.
 *
 * Every reminder exists as a DB row first (source of truth) and as a delayed
 * queue job second. A daily reconciliation job re-enqueues anything the queue
 * missed (e.g. Redis restart) and cancels reminders whose target is done.
 */
@Injectable()
export class RemindersService implements OnModuleInit {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectQueue(REMINDERS_QUEUE) private readonly queue: Queue,
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  /** Registers the daily reconciliation schedule (08:00 Istanbul). */
  async onModuleInit(): Promise<void> {
    try {
      await this.queue.upsertJobScheduler(
        'reminder-reconciliation',
        { pattern: '0 8 * * *', tz: 'Europe/Istanbul' },
        { name: RECONCILE_JOB },
      );
    } catch (error) {
      // Redis being down must not prevent the API from booting
      this.logger.error(`Could not register reconciliation schedule: ${(error as Error).message}`);
    }
  }

  async scheduleForPromissoryNote(note: PromissoryNote): Promise<void> {
    await this.schedule(ReminderType.PROMISSORY_NOTE_3_DAYS, note.id, note.dueDate, 3);
    await this.schedule(ReminderType.PROMISSORY_NOTE_1_DAY, note.id, note.dueDate, 1);
  }

  async scheduleForSeedlingOrder(order: SeedlingOrder): Promise<void> {
    await this.schedule(
      ReminderType.SEEDLING_PICKUP_3_DAYS,
      order.id,
      order.requestedPickupDate,
      3,
    );
  }

  private async schedule(
    type: ReminderType,
    targetEntityId: string,
    businessDate: Date,
    daysBefore: number,
  ): Promise<void> {
    const sendHour = this.config.get('REMINDER_SEND_HOUR');
    const scheduledFor = reminderInstant(businessDate, daysBefore, sendHour);

    // A reminder whose moment has already passed is pointless
    if (scheduledFor.getTime() <= Date.now()) {
      return;
    }

    let reminder: Reminder;
    try {
      reminder = await this.prisma.reminder.create({
        data: { type, targetEntityId, scheduledFor },
      });
    } catch {
      // Unique constraint (type, target, scheduledFor): already scheduled
      return;
    }

    await this.enqueue(reminder);
  }

  async enqueue(reminder: Reminder): Promise<void> {
    const delay = Math.max(0, reminder.scheduledFor.getTime() - Date.now());
    await this.queue.add(
      SEND_REMINDER_JOB,
      { reminderId: reminder.id } satisfies SendReminderJobData,
      {
        jobId: reminder.id,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
  }

  /** Cancels all pending reminders of an entity (e.g. note paid, order done). */
  async cancelForTarget(targetEntityId: string): Promise<void> {
    const pending = await this.prisma.reminder.findMany({
      where: {
        targetEntityId,
        status: { in: [ReminderStatus.PENDING, ReminderStatus.FAILED] },
      },
    });

    for (const reminder of pending) {
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.CANCELLED },
      });
      await this.queue.remove(reminder.id).catch(() => undefined);
    }
  }

  /**
   * Re-enqueues overdue PENDING/FAILED reminders. Target-state checks happen
   * in the processor right before sending.
   */
  async reconcile(): Promise<void> {
    const overdue = await this.prisma.reminder.findMany({
      where: {
        status: { in: [ReminderStatus.PENDING, ReminderStatus.FAILED] },
        scheduledFor: { lte: new Date() },
      },
    });

    this.logger.log(`Reconciliation found ${overdue.length} overdue reminder(s)`);
    for (const reminder of overdue) {
      if (reminder.status === ReminderStatus.FAILED) {
        await this.prisma.reminder.update({
          where: { id: reminder.id },
          data: { status: ReminderStatus.PENDING },
        });
      }
      // jobId dedupe: if the original delayed job is still there, this is a no-op
      await this.enqueue({ ...reminder, scheduledFor: new Date() });
    }
  }
}
