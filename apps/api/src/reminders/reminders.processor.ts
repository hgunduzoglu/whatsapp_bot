import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import {
  PromissoryNoteStatus,
  Reminder,
  ReminderStatus,
  ReminderType,
  SeedlingOrderStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { TEXTS } from '../bot/texts';
import { daysUntil, formatBusinessDate } from '../common/utils/date.util';
import { formatKurus } from '../common/utils/money.util';
import { customerLabel } from '../common/utils/normalize.util';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import {
  RECONCILE_JOB,
  REMINDERS_QUEUE,
  SEND_REMINDER_JOB,
  SendReminderJobData,
} from './reminders.constants';
import { RemindersService } from './reminders.service';

@Processor(REMINDERS_QUEUE)
export class RemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(RemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sender: WhatsappSenderService,
    private readonly config: AppConfigService,
    private readonly reminders: RemindersService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === RECONCILE_JOB) {
      await this.reminders.reconcile();
      return;
    }
    if (job.name === SEND_REMINDER_JOB) {
      await this.sendReminder((job.data as SendReminderJobData).reminderId);
    }
  }

  private async sendReminder(reminderId: string): Promise<void> {
    const reminder = await this.prisma.reminder.findUnique({ where: { id: reminderId } });
    if (!reminder || reminder.status === ReminderStatus.SENT) {
      return; // idempotency: never send the same reminder twice
    }
    if (reminder.status === ReminderStatus.CANCELLED) {
      return;
    }

    const message = await this.buildMessage(reminder);
    if (message === null) {
      // Target entity is gone or completed; cancel instead of sending
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.CANCELLED },
      });
      return;
    }

    try {
      for (const phone of this.config.authorizedPhones) {
        await this.sender.sendText(phone, message);
      }
    } catch (error) {
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.FAILED, errorMessage: (error as Error).message },
      });
      throw error; // let BullMQ retry with backoff
    }

    await this.prisma.reminder.update({
      where: { id: reminder.id },
      data: { status: ReminderStatus.SENT, sentAt: new Date(), errorMessage: null },
    });

    if (reminder.type === ReminderType.SEEDLING_PICKUP_3_DAYS) {
      await this.prisma.seedlingOrder.updateMany({
        where: { id: reminder.targetEntityId, status: SeedlingOrderStatus.PENDING },
        data: { status: SeedlingOrderStatus.REMINDED },
      });
    }

    this.logger.log(`Reminder ${reminder.id} (${reminder.type}) sent`);
  }

  /** Builds the message text, or null when the reminder is obsolete. */
  private async buildMessage(reminder: Reminder): Promise<string | null> {
    if (
      reminder.type === ReminderType.PROMISSORY_NOTE_3_DAYS ||
      reminder.type === ReminderType.PROMISSORY_NOTE_1_DAY
    ) {
      const note = await this.prisma.promissoryNote.findFirst({
        where: {
          id: reminder.targetEntityId,
          status: PromissoryNoteStatus.PENDING,
          isVoided: false,
          deletedAt: null,
        },
      });
      if (!note) {
        return null;
      }
      const daysLeft = Math.max(0, daysUntil(note.dueDate));
      return TEXTS.promissoryNoteReminder(
        note.payeeName,
        formatKurus(note.amountKurus),
        daysLeft,
        formatBusinessDate(note.dueDate),
      );
    }

    if (reminder.type === ReminderType.SEEDLING_PICKUP_3_DAYS) {
      const order = await this.prisma.seedlingOrder.findFirst({
        where: {
          id: reminder.targetEntityId,
          status: { in: [SeedlingOrderStatus.PENDING, SeedlingOrderStatus.REMINDED] },
          isVoided: false,
          deletedAt: null,
        },
        include: { customer: { select: { baseName: true, identifier: true } } },
      });
      if (!order) {
        return null;
      }
      return TEXTS.seedlingReminder(
        customerLabel(order.customer.baseName, order.customer.identifier),
        order.plantName,
        formatBusinessDate(order.requestedPickupDate),
      );
    }

    return null;
  }
}
