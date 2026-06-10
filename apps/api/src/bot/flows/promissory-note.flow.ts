import { Injectable } from '@nestjs/common';
import { PromissoryNote } from '@prisma/client';
import {
  businessDateAfterDays,
  DATE_OPTION_DAYS,
  formatBusinessDate,
  isBeforeToday,
} from '../../common/utils/date.util';
import { formatKurus, parseMoneyInput } from '../../common/utils/money.util';
import { isValidName } from '../../common/utils/normalize.util';
import { PromissoryNotesService } from '../../promissory-notes/promissory-notes.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS } from '../texts';

interface NoteDraft {
  payee?: string;
  amountKurus?: number;
  dueDateIso?: string;
  note?: string | null;
}

interface NoteOption {
  id: string;
  payee: string;
  amountKurus: number;
  dueDateIso: string;
}

@Injectable()
export class PromissoryNoteFlow {
  constructor(
    registry: FlowRegistry,
    private readonly notes: PromissoryNotesService,
  ) {
    registry.register(BotState.NOTES_MENU, {
      prompt: () => [TEXTS.notesMenu],
      handle: (ctx) => this.handleMenu(ctx),
    });
    registry.register(BotState.NOTE_ADD_PAYEE, {
      prompt: () => [TEXTS.askPayeeName],
      handle: (ctx) => this.handlePayee(ctx),
    });
    registry.register(BotState.NOTE_ADD_AMOUNT, {
      prompt: () => [TEXTS.askNoteAmount],
      handle: (ctx) => this.handleAmount(ctx),
    });
    registry.register(BotState.NOTE_ADD_DATE_CHOICE, {
      prompt: () => [TEXTS.askDueDate],
      handle: (ctx) => this.handleDateChoice(ctx),
    });
    registry.register(BotState.NOTE_ADD_PAST_CONFIRM, {
      prompt: () => [TEXTS.pastDueDateWarning],
      handle: (ctx) => this.handlePastConfirm(ctx),
    });
    registry.register(BotState.NOTE_ADD_NOTE, {
      prompt: () => [TEXTS.askDescription],
      handle: (ctx) => this.handleNote(ctx),
    });
    registry.register(BotState.NOTE_ADD_CONFIRM, {
      prompt: (ctx) => this.promptConfirm(ctx),
      handle: (ctx) => this.handleConfirm(ctx),
    });
    registry.register(BotState.NOTE_MARK_PAID_PICK, {
      prompt: (ctx) => this.promptMarkPaidPick(ctx),
      handle: (ctx) => this.handleMarkPaidPick(ctx),
    });
    registry.register(BotState.NOTE_MARK_PAID_CONFIRM, {
      prompt: (ctx) => this.promptMarkPaidConfirm(ctx),
      handle: (ctx) => this.handleMarkPaidConfirm(ctx),
    });

    registry.registerDateCompleted('NOTE_DUE', async (ctx, date) => {
      const draft = this.draft(ctx);
      draft.dueDateIso = date.toISOString();
      if (isBeforeToday(date)) {
        // Past due dates are allowed for promissory notes, but warned about
        return { data: { noteDraft: draft }, nextState: BotState.NOTE_ADD_PAST_CONFIRM };
      }
      return { data: { noteDraft: draft }, nextState: BotState.NOTE_ADD_NOTE };
    });
  }

  private draft(ctx: FlowContext): NoteDraft {
    return (ctx.data.noteDraft as NoteDraft) ?? {};
  }

  private save(draft: NoteDraft): { noteDraft: NoteDraft } {
    return { noteDraft: draft };
  }

  // -------------------------------------------------------------------------
  // Menu
  // -------------------------------------------------------------------------

  private async handleMenu(ctx: FlowContext): Promise<FlowResult> {
    switch (ctx.input) {
      case '1':
        return { nextState: BotState.NOTE_ADD_PAYEE, data: { noteDraft: {} } };
      case '2': {
        const pending = await this.notes.listPending();
        if (pending.length === 0) {
          return { replies: [TEXTS.noNotes], reprompt: true };
        }
        return { replies: [this.formatNoteList(TEXTS.notesHeader, pending)], reprompt: true };
      }
      case '3': {
        const upcoming = await this.notes.listUpcoming(30);
        if (upcoming.length === 0) {
          return { replies: [TEXTS.noUpcomingNotes], reprompt: true };
        }
        return {
          replies: [this.formatNoteList(TEXTS.upcomingNotesHeader, upcoming)],
          reprompt: true,
        };
      }
      case '4': {
        const paid = await this.notes.listPaid();
        if (paid.length === 0) {
          return { replies: [TEXTS.noPaidNotes], reprompt: true };
        }
        return { replies: [this.formatNoteList(TEXTS.paidNotesHeader, paid)], reprompt: true };
      }
      case '5': {
        const pending = await this.notes.listPending();
        if (pending.length === 0) {
          return { replies: [TEXTS.noNotes], reprompt: true };
        }
        const options: NoteOption[] = pending.map((note) => ({
          id: note.id,
          payee: note.payeeName,
          amountKurus: note.amountKurus,
          dueDateIso: note.dueDate.toISOString(),
        }));
        return { data: { noteOptions: options }, nextState: BotState.NOTE_MARK_PAID_PICK };
      }
      case '6':
        return { nextState: BotState.MAIN_MENU };
      default:
        return { replies: [TEXTS.invalidOption], reprompt: true };
    }
  }

  private formatNoteList(header: string, notes: PromissoryNote[]): string {
    const lines = notes.map(
      (note, index) =>
        `${index + 1}) ${note.payeeName} - ${formatKurus(note.amountKurus)} - ${formatBusinessDate(note.dueDate)}`,
    );
    return [header, '', ...lines].join('\n');
  }

  // -------------------------------------------------------------------------
  // Add note
  // -------------------------------------------------------------------------

  private async handlePayee(ctx: FlowContext): Promise<FlowResult> {
    if (!isValidName(ctx.input)) {
      return { replies: [TEXTS.invalidCustomerName] };
    }
    const draft = this.draft(ctx);
    draft.payee = ctx.input.trim();
    return { data: this.save(draft), nextState: BotState.NOTE_ADD_AMOUNT };
  }

  private async handleAmount(ctx: FlowContext): Promise<FlowResult> {
    const amountKurus = parseMoneyInput(ctx.input);
    if (amountKurus === null) {
      return { replies: [TEXTS.invalidAmount] };
    }
    const draft = this.draft(ctx);
    draft.amountKurus = amountKurus;
    return { data: this.save(draft), nextState: BotState.NOTE_ADD_DATE_CHOICE };
  }

  private async handleDateChoice(ctx: FlowContext): Promise<FlowResult> {
    const optionIndex = Number(ctx.input);
    if (Number.isInteger(optionIndex) && optionIndex >= 1 && optionIndex <= DATE_OPTION_DAYS.length) {
      const draft = this.draft(ctx);
      draft.dueDateIso = businessDateAfterDays(DATE_OPTION_DAYS[optionIndex - 1]).toISOString();
      return { data: this.save(draft), nextState: BotState.NOTE_ADD_NOTE };
    }
    if (ctx.input === '6') {
      return { data: { dateEntry: { purpose: 'NOTE_DUE' } }, nextState: BotState.DATE_ENTRY_DAY };
    }
    return { replies: [TEXTS.invalidOption], reprompt: true };
  }

  private async handlePastConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '1') {
      return { nextState: BotState.NOTE_ADD_NOTE };
    }
    if (ctx.input === '2') {
      return { nextState: BotState.NOTE_ADD_DATE_CHOICE };
    }
    return { replies: [TEXTS.invalidOption], reprompt: true };
  }

  private async handleNote(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);
    draft.note = ctx.input === '0' ? null : ctx.input;
    return { data: this.save(draft), nextState: BotState.NOTE_ADD_CONFIRM };
  }

  private promptConfirm(ctx: FlowContext): string[] {
    const draft = this.draft(ctx);
    return [
      TEXTS.noteConfirm(
        draft.payee ?? '',
        formatKurus(draft.amountKurus ?? 0),
        formatBusinessDate(new Date(draft.dueDateIso ?? new Date().toISOString())),
        draft.note ?? TEXTS.noDescription,
      ),
    ];
  }

  private async handleConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.MAIN_MENU };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const draft = this.draft(ctx);
    await this.notes.create({
      payeeName: draft.payee ?? '',
      amountKurus: draft.amountKurus ?? 0,
      dueDate: new Date(draft.dueDateIso ?? new Date().toISOString()),
      note: draft.note ?? null,
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.noteSaved],
      nextState: BotState.MAIN_MENU,
      data: { noteDraft: undefined, dateEntry: undefined },
    };
  }

  // -------------------------------------------------------------------------
  // Mark paid
  // -------------------------------------------------------------------------

  private promptMarkPaidPick(ctx: FlowContext): string[] {
    const options = (ctx.data.noteOptions as NoteOption[]) ?? [];
    const lines = options.map(
      (option, index) =>
        `${index + 1}) ${option.payee} - ${formatKurus(option.amountKurus)} - ${formatBusinessDate(new Date(option.dueDateIso))}`,
    );
    return [TEXTS.askNoteToMarkPaid(lines)];
  }

  private async handleMarkPaidPick(ctx: FlowContext): Promise<FlowResult> {
    const options = (ctx.data.noteOptions as NoteOption[]) ?? [];
    const index = Number(ctx.input);
    if (!Number.isInteger(index) || index < 1 || index > options.length) {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }
    return {
      data: { selectedNote: options[index - 1] },
      nextState: BotState.NOTE_MARK_PAID_CONFIRM,
    };
  }

  private promptMarkPaidConfirm(ctx: FlowContext): string[] {
    const selected = ctx.data.selectedNote as NoteOption | undefined;
    if (!selected) {
      return [TEXTS.genericError];
    }
    return [
      TEXTS.noteMarkPaidConfirm(
        selected.payee,
        formatKurus(selected.amountKurus),
        formatBusinessDate(new Date(selected.dueDateIso)),
      ),
    ];
  }

  private async handleMarkPaidConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.MAIN_MENU };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const selected = ctx.data.selectedNote as NoteOption | undefined;
    if (!selected) {
      return { replies: [TEXTS.genericError], nextState: BotState.MAIN_MENU };
    }

    await this.notes.markPaid(selected.id, ctx.phone);
    return {
      replies: [TEXTS.noteMarkedPaid],
      nextState: BotState.MAIN_MENU,
      data: { selectedNote: undefined, noteOptions: undefined },
    };
  }
}
