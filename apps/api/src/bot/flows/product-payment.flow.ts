import { Injectable } from '@nestjs/common';
import { CustomersService } from '../../customers/customers.service';
import { formatBusinessDate } from '../../common/utils/date.util';
import {
  formatKurus,
  formatQuantity,
  parseMoneyInput,
  parseQuantityInput,
} from '../../common/utils/money.util';
import { ProductDebtsService } from '../../product-debts/product-debts.service';
import { ProductPaymentsService } from '../../product-payments/product-payments.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS, UNIT_LABELS } from '../texts';

interface Allocation {
  itemId: string;
  label: string;
  dateLabel: string;
  unitLabel: string;
  paidQuantity: number;
  amountKurus: number | null;
}

interface SelectableItem {
  id: string;
  label: string;
  dateLabel: string;
  unitLabel: string;
  /** Remaining quantity minus what is already allocated in this session. */
  remaining: number;
}

interface ProductPaymentDraft {
  allocations: Allocation[];
  shownItems?: SelectableItem[];
  pendingItem?: SelectableItem;
  pendingQuantity?: number;
}

@Injectable()
export class ProductPaymentFlow {
  constructor(
    registry: FlowRegistry,
    private readonly customers: CustomersService,
    private readonly productDebts: ProductDebtsService,
    private readonly productPayments: ProductPaymentsService,
  ) {
    registry.register(BotState.PRODUCT_PAYMENT_PICK_ITEM, {
      prompt: (ctx) => this.promptPickItem(ctx),
      handle: (ctx) => this.handlePickItem(ctx),
    });
    registry.register(BotState.PRODUCT_PAYMENT_QUANTITY, {
      prompt: (ctx) => {
        const pending = this.draft(ctx).pendingItem;
        return [TEXTS.askPaidQuantity(pending?.label ?? '', pending?.unitLabel ?? '')];
      },
      handle: (ctx) => this.handleQuantity(ctx),
    });
    registry.register(BotState.PRODUCT_PAYMENT_AMOUNT, {
      prompt: () => [TEXTS.askPaymentValue + '\n(Değer kaydetmemek için 0 yazınız.)'],
      handle: (ctx) => this.handleAmount(ctx),
    });
    registry.register(BotState.PRODUCT_PAYMENT_MORE, {
      prompt: () => [TEXTS.askMoreProducts],
      handle: (ctx) => this.handleMore(ctx),
    });
    registry.register(BotState.PRODUCT_PAYMENT_CONFIRM, {
      prompt: (ctx) => this.promptConfirm(ctx),
      handle: (ctx) => this.handleConfirm(ctx),
    });
  }

  private draft(ctx: FlowContext): ProductPaymentDraft {
    return (ctx.data.productPayment as ProductPaymentDraft) ?? { allocations: [] };
  }

  private save(draft: ProductPaymentDraft): { productPayment: ProductPaymentDraft } {
    return { productPayment: draft };
  }

  /** Open items minus quantities already allocated in this conversation. */
  private async selectableItems(ctx: FlowContext): Promise<SelectableItem[]> {
    const draft = this.draft(ctx);
    const openItems = await this.productDebts.openItemsForCustomer(ctx.selectedCustomerId ?? '');

    return openItems
      .map((item) => {
        const allocated = draft.allocations
          .filter((allocation) => allocation.itemId === item.id)
          .reduce((sum, allocation) => sum + allocation.paidQuantity, 0);
        return {
          id: item.id,
          label: item.productName,
          dateLabel: formatBusinessDate(item.productPurchase.businessDate),
          unitLabel: UNIT_LABELS[item.unit] ?? item.unit,
          remaining: item.remainingQuantity.toNumber() - allocated,
        };
      })
      .filter((item) => item.remaining > 0);
  }

  private async promptPickItem(ctx: FlowContext): Promise<string[]> {
    const items = await this.selectableItems(ctx);
    if (items.length === 0) {
      return [TEXTS.noOpenProductDebts];
    }
    const lines = items.map(
      (item, index) =>
        `${index + 1}) ${item.dateLabel} - ${item.label} - ${formatQuantity(item.remaining)} ${item.unitLabel} açık`,
    );
    return [TEXTS.openProductDebts(lines)];
  }

  private async handlePickItem(ctx: FlowContext): Promise<FlowResult> {
    const items = await this.selectableItems(ctx);
    if (items.length === 0) {
      return { nextState: BotState.CUSTOMER_ACTIONS };
    }

    const index = Number(ctx.input);
    if (!Number.isInteger(index) || index < 1 || index > items.length) {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const draft = this.draft(ctx);
    draft.pendingItem = items[index - 1];
    return { data: this.save(draft), nextState: BotState.PRODUCT_PAYMENT_QUANTITY };
  }

  private async handleQuantity(ctx: FlowContext): Promise<FlowResult> {
    const quantity = parseQuantityInput(ctx.input);
    if (quantity === null) {
      return { replies: [TEXTS.invalidQuantity] };
    }

    const draft = this.draft(ctx);
    const pending = draft.pendingItem;
    if (!pending) {
      return { replies: [TEXTS.genericError], nextState: BotState.CUSTOMER_ACTIONS };
    }
    if (quantity > pending.remaining) {
      return { replies: [TEXTS.excessiveQuantity] };
    }

    draft.pendingQuantity = quantity;
    return { data: this.save(draft), nextState: BotState.PRODUCT_PAYMENT_AMOUNT };
  }

  private async handleAmount(ctx: FlowContext): Promise<FlowResult> {
    let amountKurus: number | null = null;
    if (ctx.input !== '0') {
      amountKurus = parseMoneyInput(ctx.input);
      if (amountKurus === null) {
        return { replies: [TEXTS.invalidAmount] };
      }
    }

    const draft = this.draft(ctx);
    const pending = draft.pendingItem;
    if (!pending || draft.pendingQuantity == null) {
      return { replies: [TEXTS.genericError], nextState: BotState.CUSTOMER_ACTIONS };
    }

    draft.allocations.push({
      itemId: pending.id,
      label: pending.label,
      dateLabel: pending.dateLabel,
      unitLabel: pending.unitLabel,
      paidQuantity: draft.pendingQuantity,
      amountKurus,
    });
    draft.pendingItem = undefined;
    draft.pendingQuantity = undefined;

    return { data: this.save(draft), nextState: BotState.PRODUCT_PAYMENT_MORE };
  }

  private async handleMore(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '1') {
      const items = await this.selectableItems(ctx);
      if (items.length === 0) {
        return {
          replies: ['Kapatılacak başka açık ürün kalmadı.'],
          nextState: BotState.PRODUCT_PAYMENT_CONFIRM,
        };
      }
      return { nextState: BotState.PRODUCT_PAYMENT_PICK_ITEM };
    }
    if (ctx.input === '2') {
      return { nextState: BotState.PRODUCT_PAYMENT_CONFIRM };
    }
    return { replies: [TEXTS.invalidOption], reprompt: true };
  }

  private async promptConfirm(ctx: FlowContext): Promise<string[]> {
    const draft = this.draft(ctx);
    const customer = await this.customers.getById(ctx.selectedCustomerId ?? '');

    const lines: string[] = [];
    for (const allocation of draft.allocations) {
      lines.push(
        `${allocation.dateLabel} - ${allocation.label}`,
        `Kapatılan miktar: ${formatQuantity(allocation.paidQuantity)} ${allocation.unitLabel}`,
        `Muhasebe değeri: ${allocation.amountKurus != null ? formatKurus(allocation.amountKurus) : '-'}`,
        '',
      );
    }
    lines.pop();

    return [TEXTS.productPaymentConfirm(this.customers.label(customer), lines)];
  }

  private async handleConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.CUSTOMER_ACTIONS };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const draft = this.draft(ctx);
    if (draft.allocations.length === 0) {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.CUSTOMER_ACTIONS };
    }

    await this.productPayments.createPayment({
      customerId: ctx.selectedCustomerId ?? '',
      allocations: draft.allocations.map((allocation) => ({
        productPurchaseItemId: allocation.itemId,
        paidQuantity: allocation.paidQuantity,
        amountKurus: allocation.amountKurus,
      })),
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.productPaymentSaved],
      nextState: BotState.CUSTOMER_ACTIONS,
      data: { productPayment: undefined },
    };
  }
}
