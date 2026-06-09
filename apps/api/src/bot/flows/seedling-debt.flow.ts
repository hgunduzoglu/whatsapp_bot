import { Injectable } from '@nestjs/common';
import { CustomersService } from '../../customers/customers.service';
import { formatBusinessDate, todayBusinessDate } from '../../common/utils/date.util';
import { formatKurus, parseMoneyInput } from '../../common/utils/money.util';
import { isValidName } from '../../common/utils/normalize.util';
import { SeedlingsService } from '../../seedlings/seedlings.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS } from '../texts';

interface OrderOption {
  id: string;
  label: string;
}

interface SeedlingDebtDraft {
  orderId?: string | null;
  orderOptions?: OrderOption[];
  plant?: string;
  unitPriceKurus?: number;
  count?: number;
}

@Injectable()
export class SeedlingDebtFlow {
  constructor(
    registry: FlowRegistry,
    private readonly customers: CustomersService,
    private readonly seedlings: SeedlingsService,
  ) {
    registry.register(BotState.SEEDLING_DEBT_PICK_ORDER, {
      prompt: (ctx) => this.promptPickOrder(ctx),
      handle: (ctx) => this.handlePickOrder(ctx),
    });
    registry.register(BotState.SEEDLING_DEBT_PLANT, {
      prompt: () => [TEXTS.askSeedlingDebtPlant],
      handle: (ctx) => this.handlePlant(ctx),
    });
    registry.register(BotState.SEEDLING_DEBT_UNIT_PRICE, {
      prompt: () => [TEXTS.askSeedlingUnitPrice],
      handle: (ctx) => this.handleUnitPrice(ctx),
    });
    registry.register(BotState.SEEDLING_DEBT_COUNT, {
      prompt: () => [TEXTS.askSeedlingCount],
      handle: (ctx) => this.handleCount(ctx),
    });
    registry.register(BotState.SEEDLING_DEBT_CONFIRM, {
      prompt: (ctx) => this.promptConfirm(ctx),
      handle: (ctx) => this.handleConfirm(ctx),
    });
  }

  private draft(ctx: FlowContext): SeedlingDebtDraft {
    return (ctx.data.seedlingDebt as SeedlingDebtDraft) ?? {};
  }

  private save(draft: SeedlingDebtDraft): { seedlingDebt: SeedlingDebtDraft } {
    return { seedlingDebt: draft };
  }

  private async orderOptions(ctx: FlowContext): Promise<OrderOption[]> {
    const orders = await this.seedlings.openOrdersForCustomer(ctx.selectedCustomerId ?? '');
    return orders.map((order) => ({
      id: order.id,
      label: `${formatBusinessDate(order.requestedPickupDate)} - ${order.plantName}`,
    }));
  }

  private async promptPickOrder(ctx: FlowContext): Promise<string[]> {
    const options = await this.orderOptions(ctx);
    if (options.length === 0) {
      return ['Açık fidan siparişi yok. Siparişsiz devam etmek için 0 yazınız.'];
    }
    const lines = options.map((option, index) => `${index + 1}) ${option.label}`);
    return [TEXTS.askRelatedOrder(lines)];
  }

  private async handlePickOrder(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);

    if (ctx.input === '0') {
      draft.orderId = null;
      return { data: this.save(draft), nextState: BotState.SEEDLING_DEBT_PLANT };
    }

    const options = await this.orderOptions(ctx);
    const index = Number(ctx.input);
    if (!Number.isInteger(index) || index < 1 || index > options.length) {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    draft.orderId = options[index - 1].id;
    return { data: this.save(draft), nextState: BotState.SEEDLING_DEBT_PLANT };
  }

  private async handlePlant(ctx: FlowContext): Promise<FlowResult> {
    if (!isValidName(ctx.input)) {
      return { replies: [TEXTS.invalidCustomerName] };
    }
    const draft = this.draft(ctx);
    draft.plant = ctx.input.trim();
    return { data: this.save(draft), nextState: BotState.SEEDLING_DEBT_UNIT_PRICE };
  }

  private async handleUnitPrice(ctx: FlowContext): Promise<FlowResult> {
    const unitPriceKurus = parseMoneyInput(ctx.input);
    if (unitPriceKurus === null) {
      return { replies: [TEXTS.invalidAmount] };
    }
    const draft = this.draft(ctx);
    draft.unitPriceKurus = unitPriceKurus;
    return { data: this.save(draft), nextState: BotState.SEEDLING_DEBT_COUNT };
  }

  private async handleCount(ctx: FlowContext): Promise<FlowResult> {
    const count = Number(ctx.input.trim());
    if (!Number.isInteger(count) || count <= 0 || count > 1_000_000) {
      return { replies: [TEXTS.invalidCount] };
    }
    const draft = this.draft(ctx);
    draft.count = count;
    return { data: this.save(draft), nextState: BotState.SEEDLING_DEBT_CONFIRM };
  }

  private async promptConfirm(ctx: FlowContext): Promise<string[]> {
    const draft = this.draft(ctx);
    const customer = await this.customers.getById(ctx.selectedCustomerId ?? '');
    const total = (draft.unitPriceKurus ?? 0) * (draft.count ?? 0);

    return [
      TEXTS.seedlingDebtConfirm(
        this.customers.label(customer),
        draft.plant ?? '',
        formatKurus(draft.unitPriceKurus ?? 0),
        draft.count ?? 0,
        formatKurus(total),
        formatBusinessDate(todayBusinessDate()),
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
    const total = (draft.unitPriceKurus ?? 0) * (draft.count ?? 0);
    const description = `${draft.plant} fidesi ${draft.count} x ${formatKurus(draft.unitPriceKurus ?? 0)}`;

    await this.seedlings.createSeedlingDebt({
      customerId: ctx.selectedCustomerId ?? '',
      relatedOrderId: draft.orderId ?? null,
      plantName: draft.plant ?? '',
      unitPriceKurus: draft.unitPriceKurus ?? 0,
      seedlingCount: draft.count ?? 0,
      description,
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.seedlingDebtSaved(formatKurus(total))],
      nextState: BotState.CUSTOMER_ACTIONS,
      data: { seedlingDebt: undefined },
    };
  }
}
