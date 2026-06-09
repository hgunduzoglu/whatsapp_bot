import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppConfigService } from '../config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { BotState } from './bot-state.enum';
import { SessionData } from './bot.types';

export interface SessionView {
  state: BotState;
  data: SessionData;
  selectedCustomerId: string | null;
  /** Previous states, used by the global "geri" (back) command. */
  history: BotState[];
  isNew: boolean;
  isExpired: boolean;
}

const HISTORY_LIMIT = 30;

@Injectable()
export class BotSessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
  ) {}

  async load(phone: string): Promise<SessionView> {
    const record = await this.prisma.botSession.findUnique({ where: { whatsappPhone: phone } });
    if (!record) {
      return {
        state: BotState.MAIN_MENU,
        data: {},
        selectedCustomerId: null,
        history: [],
        isNew: true,
        isExpired: false,
      };
    }

    const stored = (record.temporaryData ?? {}) as { history?: string[]; data?: SessionData };
    const isExpired = record.expiresAt !== null && record.expiresAt.getTime() < Date.now();
    const state = Object.values(BotState).includes(record.state as BotState)
      ? (record.state as BotState)
      : BotState.MAIN_MENU;

    return {
      state,
      data: stored.data ?? {},
      selectedCustomerId: record.selectedCustomerId,
      history: (stored.history ?? []).filter((s): s is BotState =>
        Object.values(BotState).includes(s as BotState),
      ),
      isNew: false,
      isExpired,
    };
  }

  async save(phone: string, view: SessionView): Promise<void> {
    const ttlMinutes = this.config.get('SESSION_TTL_MINUTES');
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);
    const temporaryData = {
      data: view.data,
      history: view.history.slice(-HISTORY_LIMIT),
    } as Prisma.InputJsonValue;

    await this.prisma.botSession.upsert({
      where: { whatsappPhone: phone },
      create: {
        whatsappPhone: phone,
        state: view.state,
        selectedCustomerId: view.selectedCustomerId,
        temporaryData,
        expiresAt,
      },
      update: {
        state: view.state,
        selectedCustomerId: view.selectedCustomerId,
        temporaryData,
        expiresAt,
      },
    });
  }
}
