import { Injectable } from '@nestjs/common';
import { CustomersService } from '../../customers/customers.service';
import { formatBusinessDate, todayBusinessDate } from '../../common/utils/date.util';
import { formatKurus, parseMoneyInput } from '../../common/utils/money.util';
import { MonetaryLedgerService } from '../../monetary-ledger/monetary-ledger.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS } from '../texts';

@Injectable()
export class MonetaryFlow {
  constructor(
    registry: FlowRegistry,
    private readonly customers: CustomersService,
    private readonly ledger: MonetaryLedgerService,
  ) {
    registry.register(BotState.MONETARY_DEBT_AMOUNT, {
      prompt: () => [TEXTS.askDebtAmount],
      handle: (ctx) => this.handleAmount(ctx, 'debt', BotState.MONETARY_DEBT_DESCRIPTION),
    });
    registry.register(BotState.MONETARY_DEBT_DESCRIPTION, {
      prompt: () => [TEXTS.askDescription],
      handle: (ctx) => this.handleDescription(ctx, 'debt', BotState.MONETARY_DEBT_CONFIRM),
    });
    registry.register(BotState.MONETARY_DEBT_CONFIRM, {
      prompt: (ctx) => this.promptDebtConfirm(ctx),
      handle: (ctx) => this.handleDebtConfirm(ctx),
    });

    registry.register(BotState.MONETARY_PAYMENT_AMOUNT, {
      prompt: () => [TEXTS.askPaymentAmount],
      handle: (ctx) => this.handleAmount(ctx, 'payment', BotState.MONETARY_PAYMENT_DESCRIPTION),
    });
    registry.register(BotState.MONETARY_PAYMENT_DESCRIPTION, {
      prompt: () => [TEXTS.askDescription],
      handle: (ctx) => this.handleDescription(ctx, 'payment', BotState.MONETARY_PAYMENT_CONFIRM),
    });
    registry.register(BotState.MONETARY_PAYMENT_CONFIRM, {
      prompt: (ctx) => this.promptPaymentConfirm(ctx),
      handle: (ctx) => this.handlePaymentConfirm(ctx),
    });
  }

  private async handleAmount(
    ctx: FlowContext,
    kind: 'debt' | 'payment',
    nextState: BotState,
  ): Promise<FlowResult> {
    const amountKurus = parseMoneyInput(ctx.input);
    if (amountKurus === null) {
      return { replies: [TEXTS.invalidAmount] };
    }
    return { data: { [`${kind}AmountKurus`]: amountKurus }, nextState };
  }

  private async handleDescription(
    ctx: FlowContext,
    kind: 'debt' | 'payment',
    nextState: BotState,
  ): Promise<FlowResult> {
    const description = ctx.input === '0' ? null : ctx.input;
    return { data: { [`${kind}Description`]: description }, nextState };
  }

  private async promptDebtConfirm(ctx: FlowContext): Promise<string[]> {
    const customer = await this.customers.getById(ctx.selectedCustomerId ?? '');
    const amount = (ctx.data.debtAmountKurus as number) ?? 0;
    const description = (ctx.data.debtDescription as string | null) ?? TEXTS.noDescription;
    return [
      TEXTS.debtConfirm(
        this.customers.label(customer),
        formatKurus(amount),
        description ?? TEXTS.noDescription,
        formatBusinessDate(todayBusinessDate()),
      ),
    ];
  }

  private async handleDebtConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.CUSTOMER_ACTIONS };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    await this.ledger.addDebt({
      customerId: ctx.selectedCustomerId ?? '',
      amountKurus: (ctx.data.debtAmountKurus as number) ?? 0,
      description: (ctx.data.debtDescription as string | null) ?? null,
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.debtSaved],
      nextState: BotState.CUSTOMER_ACTIONS,
      data: { debtAmountKurus: undefined, debtDescription: undefined },
    };
  }

  private async promptPaymentConfirm(ctx: FlowContext): Promise<string[]> {
    const customerId = ctx.selectedCustomerId ?? '';
    const customer = await this.customers.getById(customerId);
    const amount = (ctx.data.paymentAmountKurus as number) ?? 0;
    const description = (ctx.data.paymentDescription as string | null) ?? TEXTS.noDescription;

    const messages: string[] = [];

    // Overpayment is allowed but warned about: the balance goes negative,
    // which means the customer is now the creditor.
    const balance = await this.ledger.balance(customerId);
    if (amount > balance) {
      messages.push(TEXTS.overpayWarning(formatKurus(balance - amount)));
    }

    messages.push(
      TEXTS.paymentConfirm(
        this.customers.label(customer),
        formatKurus(amount),
        description ?? TEXTS.noDescription,
        formatBusinessDate(todayBusinessDate()),
      ),
    );
    return messages;
  }

  private async handlePaymentConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.CUSTOMER_ACTIONS };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    await this.ledger.addPayment({
      customerId: ctx.selectedCustomerId ?? '',
      amountKurus: (ctx.data.paymentAmountKurus as number) ?? 0,
      description: (ctx.data.paymentDescription as string | null) ?? null,
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.paymentSaved],
      nextState: BotState.CUSTOMER_ACTIONS,
      data: { paymentAmountKurus: undefined, paymentDescription: undefined },
    };
  }
}
