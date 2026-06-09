import { Injectable } from '@nestjs/common';
import { CustomersService } from '../../customers/customers.service';
import { isValidName } from '../../common/utils/normalize.util';
import { formatBusinessDate } from '../../common/utils/date.util';
import { formatKurus, formatQuantity } from '../../common/utils/money.util';
import { MonetaryLedgerService } from '../../monetary-ledger/monetary-ledger.service';
import { ProductDebtsService } from '../../product-debts/product-debts.service';
import { ProductPaymentsService } from '../../product-payments/product-payments.service';
import { SeedlingsService } from '../../seedlings/seedlings.service';
import { BotState } from '../bot-state.enum';
import { CustomerPickPurpose, FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS, UNIT_LABELS } from '../texts';

interface CustomerMatch {
  id: string;
  label: string;
}

interface NewCustomerDraft {
  baseName: string;
  identifier?: string;
  phone?: string;
  note?: string;
}

@Injectable()
export class CustomerFlow {
  constructor(
    private readonly registry: FlowRegistry,
    private readonly customers: CustomersService,
    private readonly ledger: MonetaryLedgerService,
    private readonly productDebts: ProductDebtsService,
    private readonly productPayments: ProductPaymentsService,
    private readonly seedlings: SeedlingsService,
  ) {
    registry.register(BotState.CUSTOMER_MENU, {
      prompt: () => [TEXTS.customerMenu],
      handle: (ctx) => this.handleCustomerMenu(ctx),
    });
    registry.register(BotState.CUSTOMER_ADD_NAME, {
      prompt: () => [TEXTS.askCustomerName],
      handle: (ctx) => this.handleAddName(ctx),
    });
    registry.register(BotState.CUSTOMER_ADD_IDENTIFIER, {
      prompt: () => [TEXTS.askIdentifier],
      handle: (ctx) => this.handleAddIdentifier(ctx),
    });
    registry.register(BotState.CUSTOMER_ADD_PHONE, {
      prompt: () => [TEXTS.askCustomerPhone],
      handle: (ctx) => this.handleAddPhone(ctx),
    });
    registry.register(BotState.CUSTOMER_ADD_NOTE, {
      prompt: () => [TEXTS.askCustomerNote],
      handle: (ctx) => this.handleAddNote(ctx),
    });
    registry.register(BotState.CUSTOMER_ADD_CONFIRM, {
      prompt: (ctx) => this.promptAddConfirm(ctx),
      handle: (ctx) => this.handleAddConfirm(ctx),
    });
    registry.register(BotState.CUSTOMER_PICK_QUERY, {
      prompt: () => [TEXTS.askSearchQuery],
      handle: (ctx) => this.handlePickQuery(ctx),
    });
    registry.register(BotState.CUSTOMER_PICK_LIST, {
      prompt: (ctx) => this.promptPickList(ctx),
      handle: (ctx) => this.handlePickList(ctx),
    });
    registry.register(BotState.CUSTOMER_ACTIONS, {
      prompt: (ctx) => this.promptCustomerActions(ctx),
      handle: (ctx) => this.handleCustomerActions(ctx),
    });

    registry.registerCustomerPicked('ACTIONS', async (_ctx, customerId) => ({
      selectedCustomerId: customerId,
      nextState: BotState.CUSTOMER_ACTIONS,
    }));
  }

  // -------------------------------------------------------------------------
  // Customer menu
  // -------------------------------------------------------------------------

  private async handleCustomerMenu(ctx: FlowContext): Promise<FlowResult> {
    switch (ctx.input) {
      case '1':
        return { nextState: BotState.CUSTOMER_ADD_NAME, data: { newCustomer: {} } };
      case '2':
      case '3':
        return {
          nextState: BotState.CUSTOMER_PICK_QUERY,
          data: { customerPickPurpose: 'ACTIONS' satisfies CustomerPickPurpose },
        };
      case '4':
        return { nextState: BotState.MAIN_MENU };
      default:
        return { replies: [TEXTS.invalidOption], reprompt: true };
    }
  }

  // -------------------------------------------------------------------------
  // Add customer
  // -------------------------------------------------------------------------

  private async handleAddName(ctx: FlowContext): Promise<FlowResult> {
    if (!isValidName(ctx.input)) {
      return { replies: [TEXTS.invalidCustomerName] };
    }

    const draft: NewCustomerDraft = { baseName: ctx.input.trim() };
    const duplicate = await this.customers.baseNameExists(draft.baseName);
    if (duplicate) {
      return {
        replies: [TEXTS.duplicateCustomer],
        data: { newCustomer: draft },
        nextState: BotState.CUSTOMER_ADD_IDENTIFIER,
      };
    }
    return { data: { newCustomer: draft }, nextState: BotState.CUSTOMER_ADD_PHONE };
  }

  private async handleAddIdentifier(ctx: FlowContext): Promise<FlowResult> {
    if (!isValidName(ctx.input)) {
      return { replies: [TEXTS.invalidCustomerName] };
    }
    const draft = this.draft(ctx);
    draft.identifier = ctx.input.trim();
    return { data: { newCustomer: draft }, nextState: BotState.CUSTOMER_ADD_PHONE };
  }

  private async handleAddPhone(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);
    if (ctx.input !== '0') {
      const digits = ctx.input.replace(/[\s()-]/g, '');
      if (!/^\+?\d{7,15}$/.test(digits)) {
        return { replies: ['Geçersiz telefon numarası. Tekrar yazınız veya 0 ile geçiniz:'] };
      }
      draft.phone = digits;
    }
    return { data: { newCustomer: draft }, nextState: BotState.CUSTOMER_ADD_NOTE };
  }

  private async handleAddNote(ctx: FlowContext): Promise<FlowResult> {
    const draft = this.draft(ctx);
    if (ctx.input !== '0') {
      draft.note = ctx.input;
    }
    return { data: { newCustomer: draft }, nextState: BotState.CUSTOMER_ADD_CONFIRM };
  }

  private promptAddConfirm(ctx: FlowContext): string[] {
    const draft = this.draft(ctx);
    const lines = [
      'Müşteri kaydedilecek:',
      '',
      `İsim: ${draft.baseName}`,
      ...(draft.identifier ? [`Ayırt edici bilgi: ${draft.identifier}`] : []),
      `Telefon: ${draft.phone ?? '-'}`,
      `Not: ${draft.note ?? '-'}`,
      '',
      TEXTS.confirmOptions,
    ];
    return [lines.join('\n')];
  }

  private async handleAddConfirm(ctx: FlowContext): Promise<FlowResult> {
    if (ctx.input === '2') {
      return { replies: [TEXTS.operationCancelled], nextState: BotState.MAIN_MENU };
    }
    if (ctx.input !== '1') {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const draft = this.draft(ctx);
    const customer = await this.customers.create({
      baseName: draft.baseName,
      identifier: draft.identifier ?? null,
      phone: draft.phone ?? null,
      note: draft.note ?? null,
      actorPhone: ctx.phone,
    });

    return {
      replies: [TEXTS.customerSaved(this.customers.label(customer))],
      selectedCustomerId: customer.id,
      nextState: BotState.CUSTOMER_ACTIONS,
      data: { newCustomer: undefined },
    };
  }

  private draft(ctx: FlowContext): NewCustomerDraft {
    return (ctx.data.newCustomer as NewCustomerDraft) ?? { baseName: '' };
  }

  // -------------------------------------------------------------------------
  // Shared customer picker
  // -------------------------------------------------------------------------

  private async handlePickQuery(ctx: FlowContext): Promise<FlowResult> {
    const matches = await this.customers.search(ctx.input);
    if (matches.length === 0) {
      return { replies: [TEXTS.noCustomerMatches] };
    }
    const data: CustomerMatch[] = matches.map((customer) => ({
      id: customer.id,
      label: this.customers.label(customer),
    }));
    return { data: { customerMatches: data }, nextState: BotState.CUSTOMER_PICK_LIST };
  }

  private promptPickList(ctx: FlowContext): string[] {
    const matches = (ctx.data.customerMatches as CustomerMatch[]) ?? [];
    const lines = matches.map((match, index) => `${index + 1}) ${match.label}`);
    return [TEXTS.customerMatches(lines)];
  }

  private async handlePickList(ctx: FlowContext): Promise<FlowResult> {
    const matches = (ctx.data.customerMatches as CustomerMatch[]) ?? [];
    const index = Number(ctx.input);
    if (!Number.isInteger(index) || index < 1 || index > matches.length) {
      return { replies: [TEXTS.invalidOption], reprompt: true };
    }

    const purpose = (ctx.data.customerPickPurpose as CustomerPickPurpose) ?? 'ACTIONS';
    const handler = this.registry.getCustomerPicked(purpose);
    if (!handler) {
      return { replies: [TEXTS.genericError], nextState: BotState.MAIN_MENU };
    }
    return handler(ctx, matches[index - 1].id);
  }

  // -------------------------------------------------------------------------
  // Selected customer actions
  // -------------------------------------------------------------------------

  private async promptCustomerActions(ctx: FlowContext): Promise<string[]> {
    const customer = await this.customers.getById(ctx.selectedCustomerId ?? '');
    return [TEXTS.customerActions(this.customers.label(customer))];
  }

  private async handleCustomerActions(ctx: FlowContext): Promise<FlowResult> {
    switch (ctx.input) {
      case '1':
        return { replies: [await this.buildDebtOverview(ctx)], reprompt: true };
      case '2':
        return { nextState: BotState.MONETARY_DEBT_AMOUNT };
      case '3':
        return { nextState: BotState.PRODUCT_DEBT_CATEGORY, data: { productDebt: undefined } };
      case '4':
        return { nextState: BotState.MONETARY_PAYMENT_AMOUNT };
      case '5': {
        // Avoid a dead-end state when there is nothing to settle
        const openItems = await this.productDebts.openItemsForCustomer(
          ctx.selectedCustomerId ?? '',
        );
        if (openItems.length === 0) {
          return { replies: [TEXTS.noOpenProductDebts], reprompt: true };
        }
        return { nextState: BotState.PRODUCT_PAYMENT_PICK_ITEM, data: { productPayment: undefined } };
      }
      case '6':
        return { nextState: BotState.SEEDLING_ORDER_PLANT, data: { seedlingOrder: undefined } };
      case '7':
        return { nextState: BotState.SEEDLING_DEBT_PICK_ORDER, data: { seedlingDebt: undefined } };
      case '8':
        return { replies: [await this.buildCustomerInfo(ctx)], reprompt: true };
      case '9':
        return { nextState: BotState.MAIN_MENU };
      default:
        return { replies: [TEXTS.invalidOption], reprompt: true };
    }
  }

  /** Debt overview per the spec: balance, product debts by date, payments. */
  private async buildDebtOverview(ctx: FlowContext): Promise<string> {
    const customerId = ctx.selectedCustomerId ?? '';
    const customer = await this.customers.getById(customerId);
    const [balance, purchases, payments, productPayments, orders] = await Promise.all([
      this.ledger.balance(customerId),
      this.productDebts.purchasesForCustomer(customerId),
      this.ledger.entriesForCustomer(customerId),
      this.productPayments.paymentsForCustomer(customerId),
      this.seedlings.openOrdersForCustomer(customerId),
    ]);

    const lines: string[] = [
      `${this.customers.label(customer)} Borç Özeti`,
      '',
      'Parasal bakiye:',
      formatKurus(balance),
    ];

    if (purchases.length > 0) {
      lines.push('', 'İlaç/gübre borçları:');
      for (const purchase of purchases) {
        lines.push('', formatBusinessDate(purchase.businessDate));
        for (const item of purchase.items) {
          const unit = UNIT_LABELS[item.unit] ?? item.unit;
          const paid = item.quantity.minus(item.remainingQuantity);
          const status = item.remainingQuantity.isZero()
            ? 'kapandı'
            : `${formatQuantity(item.remainingQuantity.toString())} ${unit} açık`;
          lines.push(
            `- ${item.productName}: ${formatQuantity(item.quantity.toString())} ${unit} alındı, ` +
              `${formatQuantity(paid.toString())} ${unit} ödendi, ${status}`,
          );
        }
      }
    }

    const monetaryPayments = payments.filter((entry) => entry.type === 'PAYMENT');
    if (monetaryPayments.length > 0) {
      lines.push('', 'Parasal ödemeler:');
      for (const entry of monetaryPayments) {
        lines.push(`${formatBusinessDate(entry.businessDate)} - ${formatKurus(entry.amountKurus)}`);
      }
    }

    if (productPayments.length > 0) {
      lines.push('', 'Ürün ödemeleri:');
      for (const payment of productPayments) {
        for (const item of payment.items) {
          const unit = UNIT_LABELS[item.productPurchaseItem.unit] ?? item.productPurchaseItem.unit;
          const value =
            item.amountKurus != null
              ? `, muhasebe değeri ${formatKurus(item.amountKurus)}`
              : '';
          lines.push(
            `${formatBusinessDate(payment.businessDate)} - ${item.productPurchaseItem.productName} için ` +
              `${formatQuantity(item.paidQuantity.toString())} ${unit} ödeme${value}`,
          );
        }
      }
    }

    if (orders.length > 0) {
      lines.push('', 'Açık fidan siparişleri:');
      for (const order of orders) {
        lines.push(
          `${formatBusinessDate(order.requestedPickupDate)} - ${order.plantName}`,
        );
      }
    }

    return lines.join('\n');
  }

  private async buildCustomerInfo(ctx: FlowContext): Promise<string> {
    const customer = await this.customers.getById(ctx.selectedCustomerId ?? '');
    return [
      'Müşteri bilgileri:',
      '',
      `İsim: ${this.customers.label(customer)}`,
      `Telefon: ${customer.phone ?? '-'}`,
      `Not: ${customer.note ?? '-'}`,
      `Kayıt tarihi: ${formatBusinessDate(customer.createdAt)}`,
    ].join('\n');
  }
}
