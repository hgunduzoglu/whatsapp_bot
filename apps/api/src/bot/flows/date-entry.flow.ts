import { Injectable } from '@nestjs/common';
import { buildManualDate, parseIntegerInput } from '../../common/utils/date.util';
import { BotState } from '../bot-state.enum';
import { DateEntryPurpose, FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS } from '../texts';

interface DateEntryDraft {
  purpose: DateEntryPurpose;
  day?: number;
  month?: number;
}

/**
 * Shared manual date entry (day -> month -> year). The flow that starts it
 * sets `data.dateEntry.purpose` and registers a completion handler with the
 * registry, which decides where the conversation continues.
 */
@Injectable()
export class DateEntryFlow {
  constructor(private readonly registry: FlowRegistry) {
    registry.register(BotState.DATE_ENTRY_DAY, {
      prompt: () => [TEXTS.askDay],
      handle: (ctx) => this.handleDay(ctx),
    });
    registry.register(BotState.DATE_ENTRY_MONTH, {
      prompt: () => [TEXTS.askMonth],
      handle: (ctx) => this.handleMonth(ctx),
    });
    registry.register(BotState.DATE_ENTRY_YEAR, {
      prompt: () => [TEXTS.askYear],
      handle: (ctx) => this.handleYear(ctx),
    });
  }

  private draft(ctx: FlowContext): DateEntryDraft {
    return (ctx.data.dateEntry as DateEntryDraft) ?? { purpose: 'NOTE_DUE' };
  }

  private async handleDay(ctx: FlowContext): Promise<FlowResult> {
    const day = parseIntegerInput(ctx.input);
    if (day === null || day < 1 || day > 31) {
      return { replies: [TEXTS.invalidDay] };
    }
    const draft = this.draft(ctx);
    draft.day = day;
    return { data: { dateEntry: draft }, nextState: BotState.DATE_ENTRY_MONTH };
  }

  private async handleMonth(ctx: FlowContext): Promise<FlowResult> {
    const month = parseIntegerInput(ctx.input);
    if (month === null || month < 1 || month > 12) {
      return { replies: [TEXTS.invalidMonth] };
    }
    const draft = this.draft(ctx);
    draft.month = month;
    return { data: { dateEntry: draft }, nextState: BotState.DATE_ENTRY_YEAR };
  }

  private async handleYear(ctx: FlowContext): Promise<FlowResult> {
    const year = parseIntegerInput(ctx.input);
    if (year === null) {
      return { replies: [TEXTS.invalidYear] };
    }

    const draft = this.draft(ctx);
    const date = buildManualDate(draft.day ?? 0, draft.month ?? 0, year);
    if (date === null) {
      return { replies: [TEXTS.invalidDate], nextState: BotState.DATE_ENTRY_DAY };
    }

    const handler = this.registry.getDateCompleted(draft.purpose);
    if (!handler) {
      return { replies: [TEXTS.genericError], nextState: BotState.MAIN_MENU };
    }
    return handler(ctx, date);
  }
}
