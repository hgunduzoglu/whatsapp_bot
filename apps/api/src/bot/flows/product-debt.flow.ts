import { Injectable } from '@nestjs/common';
import { ProductCategory, QuantityUnit } from '@prisma/client';
import { CustomersService } from '../../customers/customers.service';
import { formatBusinessDate, todayBusinessDate } from '../../common/utils/date.util';
import {
  formatKurus,
  formatQuantity,
  parseMoneyInput,
  parseQuantityInput,
} from '../../common/utils/money.util';
import { isValidName, normalizeName } from '../../common/utils/normalize.util';
import { ProductDebtsService } from '../../product-debts/product-debts.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS, UNIT_LABELS } from '../texts';

const FINISH_COMMAND = 'bitti';

const CATEGORY_OPTIONS: Record<string, ProductCategory> = {
  '1': ProductCategory.MEDICINE,
  '2': ProductCategory.FERTILIZER,
  '3': ProductCategory.OTHER,
};

const UNIT_OPTIONS: Record<string, QuantityUnit> = {
  '1': QuantityUnit.PIECE,
  '2': QuantityUnit.KG,
  '3': QuantityUnit.GRAM,
  '4': QuantityUnit.LITER,
  '5': QuantityUnit.ML,
  '6': QuantityUnit.SACK,
  '7': QuantityUnit.PACKAGE,
};

interface DraftItem {
  name: string;
  quantity: number;
  unit: QuantityUnit;
}

interface ProductDebtDraft {
  category: ProductCategory;
  items: DraftItem[];
  pendingName?: string;
  pendingQuantity?: number;
  note?: string | null;
  estimateKurus?: number | null;
}

@Injectable()
export class ProductDebtFlow {
  constructor(
    registry: FlowRegistry,
    private readonly customers: CustomersService,
    private readonly productDebts: ProductDebtsService,
  ) {
    registry.register(BotState.PRODUCT_DEBT_CATEGORY, {
      prompt: () => [TEXTS.askProductCategory],
      handle: (ctx) => this.handleCategory(ctx),
    });
    registry.register(BotState.PRODUCT_DEBT_ITEM_NAME, {
      prompt: (ctx) => [
        this.draft(ctx).items.length === 0 ? TEXTS.askFirstProductName : TEXTS.askNextProductName,
      ],
      handle: (ctx) => this.handleItemName(ctx),
    });
    registry.register(BotState.PRODUCT_DEBT_ITEM_QUANTITY, {
      prompt: (ctx) => [TEXTS.askProductQuantity(this.draft(ctx).pendingName ?? '')],
      handle: (ctx) => this.handleItemQuantity(ctx),
    });
    registry.register(BotState.PRODUCT_DEBT_ITEM_UNIT, {
      prompt: () => [TEXTS.askProductUnit],
      handle: (ctx) => this.handleItemUnit(ctx),
    });
    registry.register(BotState.PRODUCT_DEBT_NOTE, {
      prompt: () => [TEXTS.askDescription],
      handle: (ctx) => this.handleNote(ctx),
    });
    registry.register(BotState.PRODUCT_DEBT_ESTIMATE_CHOICE, {
      prompt: () => [TEXTS.askEstimateChoice],
      handle: (ctx) => this.handleEstimateChoice(ctx),
    });
    registry.register(BotState.PRODUCT_DEBT_ESTIMATE_AMOUNT, {
      prompt: () => [TEXTS.askEstimateAmount],
      handle: (ctx) => this.handleEstimateAmount(ctx),
    });
    registry.register(BotState.PRODUCT_DEBT_CONFIRM, {
      prompt: (ctx) => this.promptConfirm(ctx),
      handle: (ctx) => this.handleConfirm(ctx),
    });
  }

  private draft(ctx: FlowContext): ProductDebtDraft {
    return (
      (ctx.data.productDebt as ProductDebtDraft) ?? {
        category: ProductCategory.OTHER,
        items: [],
      }
    );
  }

  private save(draft: ProductDebtDraft): { productDebt: ProductDebtDraft } {
    return { productDebt: draft };
  }

  private async handleCategory(ctx: FlowContext): Promise<FlowResult> {
    const category = CATEGORY_OPTIONS[ctx.input];
    if (!category) {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }
    return {
      data: this.save({ category, items: [] }),
      nextState: BotState.PRODUCT_DEBT_ITEM_NAME,
    };
  }

  private async handleItemName(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);

    // "bitti" is a reserved command, never a product name
    if (normalizeName(ctx.input) === FINISH_COMMAND) {
      if (draft.items.length === 0) {
        return { replies: [TEXTS.emptyProductList], nextState: BotState.CUSTOMER_ACTIONS };
      }
      return { nextState: BotState.PRODUCT_DEBT_NOTE };
    }

    if (!isValidName(ctx.input)) {
      return { replies: [TEXTS.invalidCustomerName] };
    }

    draft.pendingName = ctx.input.trim();
    return { data: this.save(draft), nextState: BotState.PRODUCT_DEBT_ITEM_QUANTITY };
  }

  private async handleItemQuantity(ctx: FlowContext): Promise<FlowResult> {
    const quantity = parseQuantityInput(ctx.input);
    if (quantity === null) {
      return { replies: [TEXTS.invalidQuantity] };
    }
    const draft = this.draft(ctx);
    draft.pendingQuantity = quantity;
    return { data: this.save(draft), nextState: BotState.PRODUCT_DEBT_ITEM_UNIT };
  }

  private async handleItemUnit(ctx: FlowContext): Promise<FlowResult> {
    const unit = UNIT_OPTIONS[ctx.input];
    if (!unit) {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const draft = this.draft(ctx);
    const item: DraftItem = {
      name: draft.pendingName ?? '',
      quantity: draft.pendingQuantity ?? 0,
      unit,
    };
    draft.items.push(item);
    draft.pendingName = undefined;
    draft.pendingQuantity = undefined;

    const line = `${item.name} - ${formatQuantity(item.quantity)} ${UNIT_LABELS[unit]}`;
    return {
      replies: [TEXTS.productItemAdded(line)],
      data: this.save(draft),
      nextState: BotState.PRODUCT_DEBT_ITEM_NAME,
    };
  }

  private async handleNote(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);
    draft.note = ctx.input === '0' ? null : ctx.input;
    return { data: this.save(draft), nextState: BotState.PRODUCT_DEBT_ESTIMATE_CHOICE };
  }

  private async handleEstimateChoice(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '1') {
      return { nextState: BotState.PRODUCT_DEBT_ESTIMATE_AMOUNT };
    }
    if (ctx.input === '2') {
      return { nextState: BotState.PRODUCT_DEBT_CONFIRM };
    }
    return { replies: [TEXTS.invalidOption], reprompt: true };
  }

  private async handleEstimateAmount(ctx: FlowContext): Promise<FlowResult> {
    const amountKurus = parseMoneyInput(ctx.input);
    if (amountKurus === null) {
      return { replies: [TEXTS.invalidAmount] };
    }
    const draft = this.draft(ctx);
    draft.estimateKurus = amountKurus;
    return { data: this.save(draft), nextState: BotState.PRODUCT_DEBT_CONFIRM };
  }

  private async promptConfirm(ctx: FlowContext): Promise<string[]> {
    const draft = this.draft(ctx);
    const customer = await this.customers.getById(ctx.selectedCustomerId ?? '');
    const itemLines = draft.items.map(
      (item, index) =>
        `${index + 1}) ${item.name} - ${formatQuantity(item.quantity)} ${UNIT_LABELS[item.unit]}`,
    );
    return [
      TEXTS.productDebtConfirm(
        this.customers.label(customer),
        formatBusinessDate(todayBusinessDate()),
        itemLines,
        draft.note ?? TEXTS.noDescription,
        draft.estimateKurus != null ? formatKurus(draft.estimateKurus) : null,
      ),
    ];
  }

  private async handleConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.CUSTOMER_ACTIONS };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const draft = this.draft(ctx);
    await this.productDebts.createPurchase({
      customerId: ctx.selectedCustomerId ?? '',
      items: draft.items.map((item) => ({
        productName: item.name,
        category: draft.category,
        quantity: item.quantity,
        unit: item.unit,
      })),
      note: draft.note ?? null,
      estimatedAmountKurus: draft.estimateKurus ?? null,
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.productDebtSaved],
      nextState: BotState.CUSTOMER_ACTIONS,
      data: { productDebt: undefined },
    };
  }
}
