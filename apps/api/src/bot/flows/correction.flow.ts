import { Injectable } from '@nestjs/common';
import { MonetaryLedgerType } from '@prisma/client';
import {
  CorrectionsService,
  RecentTransaction,
  TransactionKind,
} from '../../corrections/corrections.service';
import { CustomersService } from '../../customers/customers.service';
import { formatBusinessDate } from '../../common/utils/date.util';
import { formatKurus, parseMoneyInput } from '../../common/utils/money.util';
import { MonetaryLedgerService } from '../../monetary-ledger/monetary-ledger.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS } from '../texts';

interface TransactionRef {
  kind: TransactionKind;
  id: string;
  summary: string;
}

const KIND_LABELS: Record<TransactionKind, string> = {
  MONETARY_ENTRY: 'Parasal işlem',
  PRODUCT_PURCHASE: 'Ürün borcu',
  PRODUCT_PAYMENT: 'Ürün ödemesi',
  SEEDLING_ORDER: 'Fidan siparişi',
  PROMISSORY_NOTE: 'Senet',
};

const MONETARY_TYPE_LABELS: Record<MonetaryLedgerType, string> = {
  DEBT: 'Parasal borç eklendi',
  PAYMENT: 'Parasal ödeme girildi',
  ADJUSTMENT_INCREASE: 'Düzeltme (borç artırma)',
  ADJUSTMENT_DECREASE: 'Düzeltme (borç azaltma)',
};

@Injectable()
export class CorrectionFlow {
  constructor(
    registry: FlowRegistry,
    private readonly corrections: CorrectionsService,
    private readonly customers: CustomersService,
    private readonly ledger: MonetaryLedgerService,
  ) {
    registry.register(BotState.CORRECTION_MENU, {
      prompt: () => [TEXTS.correctionMenu],
      handle: (ctx) => this.handleMenu(ctx),
    });
    registry.register(BotState.CORRECTION_UNDO_CONFIRM, {
      prompt: (ctx) => {
        const target = ctx.data.correctionTarget as TransactionRef | undefined;
        return [TEXTS.undoConfirm(target?.summary ?? '')];
      },
      handle: (ctx) => this.handleUndoConfirm(ctx),
    });
    registry.register(BotState.CORRECTION_DELETE_PICK, {
      prompt: (ctx) => {
        const options = (ctx.data.correctionOptions as TransactionRef[]) ?? [];
        const lines = options.map((option, index) => `${index + 1}) ${option.summary}`);
        return [TEXTS.askDeletePick(lines)];
      },
      handle: (ctx) => this.handleDeletePick(ctx),
    });
    registry.register(BotState.CORRECTION_DELETE_REASON, {
      prompt: () => [TEXTS.askDeleteReason],
      handle: (ctx) => this.handleDeleteReason(ctx),
    });
    registry.register(BotState.CORRECTION_DELETE_CONFIRM, {
      prompt: (ctx) => {
        const target = ctx.data.correctionTarget as TransactionRef | undefined;
        return [TEXTS.deleteConfirm(target?.summary ?? '')];
      },
      handle: (ctx) => this.handleDeleteConfirm(ctx),
    });
    registry.register(BotState.CORRECTION_ADJUST_DIRECTION, {
      prompt: () => [TEXTS.adjustDirection],
      handle: (ctx) => this.handleAdjustDirection(ctx),
    });
    registry.register(BotState.CORRECTION_ADJUST_AMOUNT, {
      prompt: () => [TEXTS.askAdjustAmount],
      handle: (ctx) => this.handleAdjustAmount(ctx),
    });
    registry.register(BotState.CORRECTION_ADJUST_REASON, {
      prompt: () => [TEXTS.askAdjustReason],
      handle: (ctx) => this.handleAdjustReason(ctx),
    });
    registry.register(BotState.CORRECTION_ADJUST_CONFIRM, {
      prompt: (ctx) => this.promptAdjustConfirm(ctx),
      handle: (ctx) => this.handleAdjustConfirm(ctx),
    });

    registry.registerCustomerPicked('ADJUSTMENT', async (_ctx, customerId) => ({
      data: { adjustCustomerId: customerId },
      nextState: BotState.CORRECTION_ADJUST_DIRECTION,
    }));
  }

  private summarize(transaction: RecentTransaction): string {
    const parts: string[] = [];
    if (transaction.customerLabel) {
      parts.push(transaction.customerLabel);
    }

    const action =
      transaction.kind === 'MONETARY_ENTRY' && transaction.monetaryType
        ? MONETARY_TYPE_LABELS[transaction.monetaryType]
        : KIND_LABELS[transaction.kind];

    const amount = transaction.amountKurus != null ? `: ${formatKurus(transaction.amountKurus)}` : '';
    const detail = transaction.detail ? ` (${transaction.detail})` : '';
    parts.push(`${action}${amount}${detail}`);

    if (transaction.businessDate) {
      parts.push(`Tarih: ${formatBusinessDate(transaction.businessDate)}`);
    }
    return parts.join('\n');
  }

  private toRef(transaction: RecentTransaction): TransactionRef {
    return { kind: transaction.kind, id: transaction.id, summary: this.summarize(transaction) };
  }

  private async handleMenu(ctx: FlowContext): Promise<FlowResult> {
    switch (ctx.input) {
      case '1': {
        const transactions = await this.corrections.recentTransactions(5);
        if (transactions.length === 0) {
          return { replies: [TEXTS.noRecentTransactions], reprompt: true };
        }
        const lines = transactions.map(
          (transaction, index) => `${index + 1}) ${this.summarize(transaction).replace(/\n/g, ' | ')}`,
        );
        return {
          replies: [[TEXTS.recentTransactionsHeader, '', ...lines].join('\n')],
          reprompt: true,
        };
      }
      case '2': {
        const last = await this.corrections.lastTransaction();
        if (!last) {
          return { replies: [TEXTS.noRecentTransactions], reprompt: true };
        }
        return {
          data: { correctionTarget: this.toRef(last) },
          nextState: BotState.CORRECTION_UNDO_CONFIRM,
        };
      }
      case '3': {
        const transactions = await this.corrections.recentTransactions(5);
        if (transactions.length === 0) {
          return { replies: [TEXTS.noRecentTransactions], reprompt: true };
        }
        return {
          data: { correctionOptions: transactions.map((transaction) => this.toRef(transaction)) },
          nextState: BotState.CORRECTION_DELETE_PICK,
        };
      }
      case '4':
        return {
          nextState: BotState.CUSTOMER_PICK_QUERY,
          data: { customerPickPurpose: 'ADJUSTMENT' },
        };
      case '5':
        return { nextState: BotState.MAIN_MENU };
      default:
        return { replies: [TEXTS.invalidOption], reprompt: true };
    }
  }

  private async handleUndoConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { nextState: BotState.CORRECTION_MENU, data: { correctionTarget: undefined } };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const target = ctx.data.correctionTarget as TransactionRef | undefined;
    if (!target) {
      return { replies: [TEXTS.genericError], nextState: BotState.CORRECTION_MENU };
    }

    await this.corrections.voidTransaction(target.kind, target.id, 'Geri alındı', ctx.phone);
    return {
      replies: [TEXTS.undoDone],
      nextState: BotState.MAIN_MENU,
    };
  }

  private async handleDeletePick(ctx: FlowContext): Promise<FlowResult> {
    const options = (ctx.data.correctionOptions as TransactionRef[]) ?? [];
    const index = Number(ctx.input);
    if (!Number.isInteger(index) || index < 1 || index > options.length) {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }
    return {
      data: { correctionTarget: options[index - 1] },
      nextState: BotState.CORRECTION_DELETE_REASON,
    };
  }

  private async handleDeleteReason(ctx: FlowContext): Promise<FlowResult> {
    // Deletion always requires an explicit reason for the audit trail
    if (ctx.input.length === 0 || ctx.input === '0') {
      return { replies: [TEXTS.deleteReasonRequired] };
    }
    return { data: { deleteReason: ctx.input }, nextState: BotState.CORRECTION_DELETE_CONFIRM };
  }

  private async handleDeleteConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return {
        nextState: BotState.CORRECTION_MENU,
        data: { correctionTarget: undefined, deleteReason: undefined, correctionOptions: undefined },
      };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const target = ctx.data.correctionTarget as TransactionRef | undefined;
    const reason = (ctx.data.deleteReason as string) ?? '';
    if (!target || reason.length === 0) {
      return { replies: [TEXTS.genericError], nextState: BotState.CORRECTION_MENU };
    }

    await this.corrections.deleteTransaction(target.kind, target.id, reason, ctx.phone);
    return {
      replies: [TEXTS.deleteDone],
      nextState: BotState.MAIN_MENU,
    };
  }

  private async handleAdjustDirection(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '1') {
      return { data: { adjustDirection: 'INCREASE' }, nextState: BotState.CORRECTION_ADJUST_AMOUNT };
    }
    if (ctx.input === '2') {
      return { data: { adjustDirection: 'DECREASE' }, nextState: BotState.CORRECTION_ADJUST_AMOUNT };
    }
    return { replies: [TEXTS.invalidOption], reprompt: true };
  }

  private async handleAdjustAmount(ctx: FlowContext): Promise<FlowResult> {
    const amountKurus = parseMoneyInput(ctx.input);
    if (amountKurus === null) {
      return { replies: [TEXTS.invalidAmount] };
    }
    return { data: { adjustAmountKurus: amountKurus }, nextState: BotState.CORRECTION_ADJUST_REASON };
  }

  private async handleAdjustReason(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input.length === 0 || ctx.input === '0') {
      return { replies: [TEXTS.deleteReasonRequired] };
    }
    return { data: { adjustReason: ctx.input }, nextState: BotState.CORRECTION_ADJUST_CONFIRM };
  }

  private async promptAdjustConfirm(ctx: FlowContext): Promise<string[]> {
    const customer = await this.customers.getById((ctx.data.adjustCustomerId as string) ?? '');
    const direction = ctx.data.adjustDirection === 'INCREASE' ? 'Borç artır' : 'Borç azalt';
    return [
      TEXTS.adjustConfirm(
        this.customers.label(customer),
        direction,
        formatKurus((ctx.data.adjustAmountKurus as number) ?? 0),
        (ctx.data.adjustReason as string) ?? '',
      ),
    ];
  }

  private async handleAdjustConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return {
        replies: [TEXTS.operationCancelled],
        nextState: BotState.CORRECTION_MENU,
        data: {
          adjustCustomerId: undefined,
          adjustDirection: undefined,
          adjustAmountKurus: undefined,
          adjustReason: undefined,
        },
      };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    await this.ledger.addAdjustment(
      (ctx.data.adjustDirection as 'INCREASE' | 'DECREASE') ?? 'INCREASE',
      {
        customerId: (ctx.data.adjustCustomerId as string) ?? '',
        amountKurus: (ctx.data.adjustAmountKurus as number) ?? 0,
        description: (ctx.data.adjustReason as string) ?? null,
        actorPhone: ctx.phone,
      },
    );

    return {
      replies: [TEXTS.adjustSaved],
      nextState: BotState.MAIN_MENU,
    };
  }
}
