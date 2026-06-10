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
import { TemplateParameter, WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import {
  RECONCILE_JOB,
  REMINDER_TEMPLATE_LANGUAGE,
  REMINDER_TEMPLATES,
  REMINDERS_QUEUE,
  SEND_REMINDER_JOB,
  SendReminderJobData,
} from './reminders.constants';
import { RemindersService } from './reminders.service';

interface ReminderPayload {
  /** Free-form text, deliverable while the 24h service window is open. */
  text: string;
  /** Pre-approved template used when the window is closed. */
  templateName: string;
  parameters: TemplateParameter[];
}

/**
 * Meta rejects free-form messages sent more than 24 hours after the
 * recipient's last message with error 131047 (re-engagement).
 */
export function isReengagementError(error: unknown): boolean {
  return error instanceof Error && /131047|re-?engagement/i.test(error.message);
}

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

    const payload = await this.buildPayload(reminder);
    if (payload === null) {
      // Target entity is gone or completed; cancel instead of sending
      await this.prisma.reminder.update({
        where: { id: reminder.id },
        data: { status: ReminderStatus.CANCELLED },
      });
      return;
    }

    try {
      for (const phone of this.config.authorizedPhones) {
        await this.deliver(phone, payload);
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

  /**
   * Free-form text is free of charge, so it is tried first; when Meta
   * reports the service window closed, the approved template is sent instead.
   */
  private async deliver(phone: string, payload: ReminderPayload): Promise<void> {
    try {
      await this.sender.sendText(phone, payload.text);
    } catch (error) {
      if (!isReengagementError(error)) {
        throw error;
      }
      this.logger.log(`Service window closed for ${phone}; falling back to template`);
      await this.sender.sendTemplate(
        phone,
        payload.templateName,
        REMINDER_TEMPLATE_LANGUAGE,
        payload.parameters,
      );
    }
  }

  /** Builds the message payload, or null when the reminder is obsolete. */
  private async buildPayload(reminder: Reminder): Promise<ReminderPayload | null> {
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
      const amount = formatKurus(note.amountKurus);
      const dueDate = formatBusinessDate(note.dueDate);
      return {
        text: TEXTS.promissoryNoteReminder(note.payeeName, amount, daysLeft, dueDate),
        templateName: REMINDER_TEMPLATES[reminder.type],
        parameters: [note.payeeName, amount, String(daysLeft), dueDate].map((text) => ({
          type: 'text',
          text,
        })),
      };
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
      const label = customerLabel(order.customer.baseName, order.customer.identifier);
      const pickupDate = formatBusinessDate(order.requestedPickupDate);
      return {
        text: TEXTS.seedlingReminder(label, order.plantName, pickupDate),
        templateName: REMINDER_TEMPLATES[reminder.type],
        parameters: [label, order.plantName, pickupDate].map((text) => ({ type: 'text', text })),
      };
    }

    return null;
  }
}
