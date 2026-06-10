import { Injectable } from '@nestjs/common';
import { SeedUnit } from '@prisma/client';
import { CustomersService } from '../../customers/customers.service';
import {
  businessDateAfterDays,
  DATE_OPTION_DAYS,
  formatBusinessDate,
  isBeforeToday,
} from '../../common/utils/date.util';
import { formatQuantity, parseQuantityInput } from '../../common/utils/money.util';
import { isValidName } from '../../common/utils/normalize.util';
import { SeedlingsService } from '../../seedlings/seedlings.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { SEED_UNIT_LABELS, TEXTS } from '../texts';

interface SeedlingOrderDraft {
  plant?: string;
  seedGiven?: boolean;
  seedPlant?: string;
  seedUnit?: SeedUnit;
  seedAmount?: number;
  pickupDateIso?: string;
  note?: string | null;
}

@Injectable()
export class SeedlingOrderFlow {
  constructor(
    registry: FlowRegistry,
    private readonly customers: CustomersService,
    private readonly seedlings: SeedlingsService,
  ) {
    registry.register(BotState.SEEDLING_ORDER_PLANT, {
      prompt: () => [TEXTS.askPlantName],
      handle: (ctx) => this.handlePlant(ctx),
    });
    registry.register(BotState.SEEDLING_ORDER_SEED_GIVEN, {
      prompt: () => [TEXTS.askSeedGiven],
      handle: (ctx) => this.handleSeedGiven(ctx),
    });
    registry.register(BotState.SEEDLING_ORDER_SEED_PLANT, {
      prompt: () => [TEXTS.askSeedPlantName],
      handle: (ctx) => this.handleSeedPlant(ctx),
    });
    registry.register(BotState.SEEDLING_ORDER_SEED_UNIT, {
      prompt: () => [TEXTS.askSeedUnit],
      handle: (ctx) => this.handleSeedUnit(ctx),
    });
    registry.register(BotState.SEEDLING_ORDER_SEED_AMOUNT, {
      prompt: () => [TEXTS.askSeedAmount],
      handle: (ctx) => this.handleSeedAmount(ctx),
    });
    registry.register(BotState.SEEDLING_ORDER_DATE_CHOICE, {
      prompt: () => [TEXTS.askPickupDate],
      handle: (ctx) => this.handleDateChoice(ctx),
    });
    registry.register(BotState.SEEDLING_ORDER_NOTE, {
      prompt: () => [TEXTS.askDescription],
      handle: (ctx) => this.handleNote(ctx),
    });
    registry.register(BotState.SEEDLING_ORDER_CONFIRM, {
      prompt: (ctx) => this.promptConfirm(ctx),
      handle: (ctx) => this.handleConfirm(ctx),
    });

    registry.registerDateCompleted('SEEDLING_PICKUP', async (ctx, date) => {
      if (isBeforeToday(date)) {
        return { replies: [TEXTS.pickupDateInPast], nextState: BotState.SEEDLING_ORDER_DATE_CHOICE };
      }
      const draft = this.draft(ctx);
      draft.pickupDateIso = date.toISOString();
      return { data: { seedlingOrder: draft }, nextState: BotState.SEEDLING_ORDER_NOTE };
    });
  }

  private draft(ctx: FlowContext): SeedlingOrderDraft {
    return (ctx.data.seedlingOrder as SeedlingOrderDraft) ?? {};
  }

  private save(draft: SeedlingOrderDraft): { seedlingOrder: SeedlingOrderDraft } {
    return { seedlingOrder: draft };
  }

  private async handlePlant(ctx: FlowContext): Promise<FlowResult> {
    if (!isValidName(ctx.input)) {
      return { replies: [TEXTS.invalidCustomerName] };
    }
    const draft = this.draft(ctx);
    draft.plant = ctx.input.trim();
    return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_SEED_GIVEN };
  }

  private async handleSeedGiven(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);
    if (ctx.input === '1') {
      draft.seedGiven = true;
      return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_SEED_PLANT };
    }
    if (ctx.input === '2') {
      draft.seedGiven = false;
      return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_DATE_CHOICE };
    }
    return { replies: [TEXTS.invalidOption], reprompt: true };
  }

  private async handleSeedPlant(ctx: FlowContext): Promise<FlowResult> {
    if (!isValidName(ctx.input)) {
      return { replies: [TEXTS.invalidCustomerName] };
    }
    const draft = this.draft(ctx);
    draft.seedPlant = ctx.input.trim();
    return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_SEED_UNIT };
  }

  private async handleSeedUnit(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);
    if (ctx.input === '1') {
      draft.seedUnit = SeedUnit.ENVELOPE;
    } else if (ctx.input === '2') {
      draft.seedUnit = SeedUnit.GRAM;
    } else {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }
    return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_SEED_AMOUNT };
  }

  private async handleSeedAmount(ctx: FlowContext): Promise<FlowResult> {
    const amount = parseQuantityInput(ctx.input);
    if (amount === null) {
      return { replies: [TEXTS.invalidQuantity] };
    }
    const draft = this.draft(ctx);
    draft.seedAmount = amount;
    return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_DATE_CHOICE };
  }

  private async handleDateChoice(ctx: FlowContext): Promise<FlowResult> {
    const optionIndex = Number(ctx.input);
    if (Number.isInteger(optionIndex) && optionIndex >= 1 && optionIndex <= DATE_OPTION_DAYS.length) {
      const draft = this.draft(ctx);
      draft.pickupDateIso = businessDateAfterDays(DATE_OPTION_DAYS[optionIndex - 1]).toISOString();
      return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_NOTE };
    }
    if (ctx.input === '6') {
      return {
        data: { dateEntry: { purpose: 'SEEDLING_PICKUP' } },
        nextState: BotState.DATE_ENTRY_DAY,
      };
    }
    return { replies: [TEXTS.invalidOption], reprompt: true };
  }

  private async handleNote(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);
    draft.note = ctx.input === '0' ? null : ctx.input;
    return { data: this.save(draft), nextState: BotState.SEEDLING_ORDER_CONFIRM };
  }

  private async promptConfirm(ctx: FlowContext): Promise<string[]> {
    const draft = this.draft(ctx);
    const customer = await this.customers.getById(ctx.selectedCustomerId ?? '');
    const seedInfo = draft.seedGiven
      ? TEXTS.seedGivenInfo(
          draft.seedPlant ?? '',
          formatQuantity(draft.seedAmount ?? 0),
          SEED_UNIT_LABELS[draft.seedUnit ?? 'ENVELOPE'],
        )
      : TEXTS.seedNotGiven;

    return [
      TEXTS.seedlingOrderConfirm(
        this.customers.label(customer),
        draft.plant ?? '',
        seedInfo,
        formatBusinessDate(new Date(draft.pickupDateIso ?? new Date().toISOString())),
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
    await this.seedlings.createOrder({
      customerId: ctx.selectedCustomerId ?? '',
      plantName: draft.plant ?? '',
      seedGiven: draft.seedGiven ?? false,
      seedPlantName: draft.seedPlant ?? null,
      seedAmount: draft.seedAmount ?? null,
      seedUnit: draft.seedUnit ?? null,
      requestedPickupDate: new Date(draft.pickupDateIso ?? new Date().toISOString()),
      note: draft.note ?? null,
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.seedlingOrderSaved],
      nextState: BotState.MAIN_MENU,
      data: { seedlingOrder: undefined, dateEntry: undefined },
    };
  }
}
