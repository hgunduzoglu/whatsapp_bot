import { Injectable } from '@nestjs/common';
import { MonetaryLedgerSource, MonetaryLedgerType } from '@prisma/client';
import { customerLabel } from '../../common/utils/normalize.util';
import { formatBusinessDate, todayBusinessDate } from '../../common/utils/date.util';
import { formatKurus, formatQuantity } from '../../common/utils/money.util';
import { ActivitySummary, ReportsService } from '../../reports/reports.service';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS, UNIT_LABELS } from '../texts';

@Injectable()
export class ReportFlow {
  constructor(
    registry: FlowRegistry,
    private readonly reports: ReportsService,
  ) {
    registry.register(BotState.REPORTS_MENU, {
      prompt: () => [TEXTS.reportsMenu],
      handle: (ctx) => this.handleMenu(ctx),
    });
    registry.register(BotState.REPORT_STATEMENT_RANGE, {
      prompt: () => [TEXTS.statementRangeOptions],
      handle: (ctx) => this.handleStatementRange(ctx),
    });

    registry.registerCustomerPicked('STATEMENT', async (_ctx, customerId) => ({
      data: { statementCustomerId: customerId },
      nextState: BotState.REPORT_STATEMENT_RANGE,
    }));

    registry.registerDateCompleted('STATEMENT_FROM', async (ctx, date) => {
      return {
        replies: [
          `Başlangıç tarihi: ${formatBusinessDate(date)}`,
          'Şimdi bitiş tarihini giriniz.',
        ],
        data: {
          statementFromIso: date.toISOString(),
          dateEntry: { purpose: 'STATEMENT_TO' },
        },
        nextState: BotState.DATE_ENTRY_DAY,
      };
    });

    registry.registerDateCompleted('STATEMENT_TO', async (ctx, date) => {
      const fromIso = ctx.data.statementFromIso as string | undefined;
      const from = fromIso ? new Date(fromIso) : undefined;
      if (from && date.getTime() < from.getTime()) {
        return {
          replies: ['Bitiş tarihi başlangıç tarihinden önce olamaz.', 'Bitiş tarihini tekrar giriniz.'],
          data: { dateEntry: { purpose: 'STATEMENT_TO' } },
          nextState: BotState.DATE_ENTRY_DAY,
        };
      }
      const statement = await this.buildStatement(ctx, { from, to: date });
      return {
        replies: [statement],
        nextState: BotState.REPORTS_MENU,
        data: { statementCustomerId: undefined, statementFromIso: undefined, dateEntry: undefined },
      };
    });
  }

  private async handleMenu(ctx: FlowContext): Promise<FlowResult> {
    switch (ctx.input) {
      case '1': {
        const summary = await this.reports.dailySummary();
        return {
          replies: [this.formatActivity(`Bugünkü Özet - ${formatBusinessDate(todayBusinessDate())}`, summary)],
          reprompt: true,
        };
      }
      case '2': {
        const summary = await this.reports.weeklySummary();
        return {
          replies: [
            this.formatActivity(
              `Haftalık Özet - ${formatBusinessDate(summary.from)} / ${formatBusinessDate(summary.to)}`,
              summary,
              true,
            ),
          ],
          reprompt: true,
        };
      }
      case '3': {
        const { total, lines } = await this.reports.receivables();
        if (lines.length === 0) {
          return { replies: ['Parasal alacak yok.'], reprompt: true };
        }
        const text = [
          'Toplam parasal alacak:',
          formatKurus(total),
          '',
          ...lines.map(
            (line, index) =>
              `${index + 1}) ${customerLabel(line.customer.baseName, line.customer.identifier)}: ${formatKurus(line.balanceKurus)}`,
          ),
        ].join('\n');
        return { replies: [text], reprompt: true };
      }
      case '4': {
        const items = await this.reports.openProductDebts();
        if (items.length === 0) {
          return { replies: ['Açık ilaç/gübre borcu yok.'], reprompt: true };
        }
        const lines: string[] = ['Açık ilaç/gübre borçları:'];
        let currentCustomer = '';
        for (const item of items) {
          const label = customerLabel(
            item.productPurchase.customer.baseName,
            item.productPurchase.customer.identifier,
          );
          if (label !== currentCustomer) {
            lines.push('', label);
            currentCustomer = label;
          }
          lines.push(
            `${formatBusinessDate(item.productPurchase.businessDate)} - ${item.productName}: ` +
              `${formatQuantity(item.remainingQuantity.toString())} ${UNIT_LABELS[item.unit] ?? item.unit} açık`,
          );
        }
        return { replies: [lines.join('\n')], reprompt: true };
      }
      case '5': {
        const orders = await this.reports.upcomingSeedlingDeliveries(30);
        if (orders.length === 0) {
          return { replies: ['Önümüzdeki 30 gün içinde fidan teslimi yok.'], reprompt: true };
        }
        const lines = orders.map(
          (order) =>
            `${formatBusinessDate(order.requestedPickupDate)} - ` +
            `${customerLabel(order.customer.baseName, order.customer.identifier)} - ${order.plantName}`,
        );
        return { replies: [['Yaklaşan fidan teslimleri:', '', ...lines].join('\n')], reprompt: true };
      }
      case '6': {
        const notes = await this.reports.upcomingPromissoryNotes(30);
        if (notes.length === 0) {
          return { replies: [TEXTS.noUpcomingNotes], reprompt: true };
        }
        const lines = notes.map(
          (note) =>
            `${formatBusinessDate(note.dueDate)} - ${note.payeeName} - ${formatKurus(note.amountKurus)}`,
        );
        return { replies: [[TEXTS.upcomingNotesHeader, '', ...lines].join('\n')], reprompt: true };
      }
      case '7':
        return {
          nextState: BotState.CUSTOMER_PICK_QUERY,
          data: { customerPickPurpose: 'STATEMENT' },
        };
      case '8':
        return { nextState: BotState.MAIN_MENU };
      default:
        return { replies: [TEXTS.invalidOption], reprompt: true };
    }
  }

  private async handleStatementRange(ctx: FlowContext): Promise<FlowResult> {
    switch (ctx.input) {
      case '1': {
        const statement = await this.buildStatement(ctx, {
          from: this.daysAgo(7),
          to: todayBusinessDate(),
        });
        return { replies: [statement], nextState: BotState.REPORTS_MENU };
      }
      case '2': {
        const statement = await this.buildStatement(ctx, {
          from: this.daysAgo(30),
          to: todayBusinessDate(),
        });
        return { replies: [statement], nextState: BotState.REPORTS_MENU };
      }
      case '3': {
        const statement = await this.buildStatement(ctx, {});
        return { replies: [statement], nextState: BotState.REPORTS_MENU };
      }
      case '4':
        return {
          data: { dateEntry: { purpose: 'STATEMENT_FROM' } },
          nextState: BotState.DATE_ENTRY_DAY,
        };
      default:
        return { replies: [TEXTS.invalidOption], reprompt: true };
    }
  }

  private daysAgo(days: number): Date {
    const today = todayBusinessDate();
    return new Date(today.getTime() - days * 24 * 60 * 60 * 1000);
  }

  private async buildStatement(
    ctx: FlowContext,
    range: { from?: Date; to?: Date },
  ): Promise<string> {
    const customerId = (ctx.data.statementCustomerId as string) ?? ctx.selectedCustomerId ?? '';
    const statement = await this.reports.customerStatement(customerId, range);
    const label = customerLabel(statement.customer.baseName, statement.customer.identifier);

    const lines: string[] = [`${label} Ekstresi`];
    if (range.from || range.to) {
      lines.push(
        `Dönem: ${range.from ? formatBusinessDate(range.from) : '...'} - ${range.to ? formatBusinessDate(range.to) : '...'}`,
      );
    }

    const debts = statement.monetaryEntries.filter(
      (entry) => entry.type === MonetaryLedgerType.DEBT,
    );
    const payments = statement.monetaryEntries.filter(
      (entry) => entry.type === MonetaryLedgerType.PAYMENT,
    );
    const adjustments = statement.monetaryEntries.filter(
      (entry) =>
        entry.type === MonetaryLedgerType.ADJUSTMENT_INCREASE ||
        entry.type === MonetaryLedgerType.ADJUSTMENT_DECREASE,
    );

    if (debts.length > 0) {
      lines.push('', 'Parasal borçlar:');
      for (const entry of debts) {
        const seedling = entry.source === MonetaryLedgerSource.SEEDLING_DEBT ? ' (fidan)' : '';
        lines.push(
          `${formatBusinessDate(entry.businessDate)} - ${formatKurus(entry.amountKurus)}${seedling}` +
            (entry.description ? ` - ${entry.description}` : ''),
        );
      }
    }

    if (payments.length > 0) {
      lines.push('', 'Parasal ödemeler:');
      for (const entry of payments) {
        lines.push(
          `${formatBusinessDate(entry.businessDate)} - ${formatKurus(entry.amountKurus)}` +
            (entry.description ? ` - ${entry.description}` : ''),
        );
      }
    }

    if (adjustments.length > 0) {
      lines.push('', 'Düzeltmeler:');
      for (const entry of adjustments) {
        const sign = entry.type === MonetaryLedgerType.ADJUSTMENT_INCREASE ? '+' : '-';
        lines.push(
          `${formatBusinessDate(entry.businessDate)} - ${sign}${formatKurus(entry.amountKurus)}`,
        );
      }
    }

    if (statement.productPurchases.length > 0) {
      lines.push('', 'Ürün borçları:');
      for (const purchase of statement.productPurchases) {
        for (const item of purchase.items) {
          lines.push(
            `${formatBusinessDate(purchase.businessDate)} - ${item.productName}: ` +
              `${formatQuantity(item.quantity.toString())} ${UNIT_LABELS[item.unit] ?? item.unit}`,
          );
        }
      }
    }

    if (statement.productPayments.length > 0) {
      lines.push('', 'Ürün ödemeleri:');
      for (const payment of statement.productPayments) {
        for (const item of payment.items) {
          const value = item.amountKurus != null ? ` - ${formatKurus(item.amountKurus)}` : '';
          lines.push(
            `${formatBusinessDate(payment.businessDate)} - ${item.productPurchaseItem.productName}: ` +
              `${formatQuantity(item.paidQuantity.toString())} ${UNIT_LABELS[item.productPurchaseItem.unit] ?? item.productPurchaseItem.unit}${value}`,
          );
        }
      }
    }

    if (statement.seedlingOrders.length > 0) {
      lines.push('', 'Fidan siparişleri:');
      for (const order of statement.seedlingOrders) {
        lines.push(
          `${formatBusinessDate(order.requestedPickupDate)} - ${order.plantName}`,
        );
      }
    }

    lines.push('', `Güncel parasal bakiye: ${formatKurus(statement.balanceKurus)}`);

    if (statement.openItems.length > 0) {
      lines.push('', 'Açık ürün borçları:');
      for (const item of statement.openItems) {
        lines.push(
          `${formatBusinessDate(item.productPurchase.businessDate)} - ${item.productName}: ` +
            `${formatQuantity(item.remainingQuantity.toString())} ${UNIT_LABELS[item.unit] ?? item.unit} açık`,
        );
      }
    }

    return lines.join('\n');
  }

  /** Formats a daily/weekly activity summary. */
  private formatActivity(title: string, summary: ActivitySummary, withDates = false): string {
    const lines: string[] = [title];
    const prefix = (date: Date): string => (withDates ? `${formatBusinessDate(date)} - ` : '');

    const debts = summary.monetaryEntries.filter((e) => e.type === MonetaryLedgerType.DEBT);
    const payments = summary.monetaryEntries.filter((e) => e.type === MonetaryLedgerType.PAYMENT);

    if (debts.length > 0) {
      lines.push('', 'Parasal borç girişleri:');
      for (const entry of debts) {
        lines.push(
          `- ${prefix(entry.businessDate)}${customerLabel(entry.customer.baseName, entry.customer.identifier)}: ${formatKurus(entry.amountKurus)}`,
        );
      }
    }

    if (payments.length > 0) {
      lines.push('', 'Parasal ödemeler:');
      for (const entry of payments) {
        lines.push(
          `- ${prefix(entry.businessDate)}${customerLabel(entry.customer.baseName, entry.customer.identifier)}: ${formatKurus(entry.amountKurus)}`,
        );
      }
    }

    if (summary.productPurchases.length > 0) {
      lines.push('', 'Ürün borçları:');
      for (const purchase of summary.productPurchases) {
        const items = purchase.items
          .map(
            (item) =>
              `${item.productName} ${formatQuantity(item.quantity.toString())} ${UNIT_LABELS[item.unit] ?? item.unit}`,
          )
          .join(', ');
        lines.push(
          `- ${prefix(purchase.businessDate)}${customerLabel(purchase.customer.baseName, purchase.customer.identifier)}: ${items}`,
        );
      }
    }

    if (summary.productPayments.length > 0) {
      lines.push('', 'Ürün ödemeleri:');
      for (const payment of summary.productPayments) {
        const items = payment.items
          .map(
            (item) =>
              `${item.productPurchaseItem.productName} ${formatQuantity(item.paidQuantity.toString())} ${UNIT_LABELS[item.productPurchaseItem.unit] ?? item.productPurchaseItem.unit}`,
          )
          .join(', ');
        const total =
          payment.totalAmountKurus > 0
            ? `, ${formatKurus(payment.totalAmountKurus)} muhasebe değeri`
            : '';
        lines.push(
          `- ${prefix(payment.businessDate)}${customerLabel(payment.customer.baseName, payment.customer.identifier)}: ${items}${total}`,
        );
      }
    }

    if (summary.seedlingOrders.length > 0) {
      lines.push('', 'Fidan siparişleri:');
      for (const order of summary.seedlingOrders) {
        lines.push(
          `- ${customerLabel(order.customer.baseName, order.customer.identifier)}: ${order.plantName}, teslim ${formatBusinessDate(order.requestedPickupDate)}`,
        );
      }
    }

    if (summary.promissoryNotes.length > 0) {
      lines.push('', 'Senet işlemleri:');
      for (const note of summary.promissoryNotes) {
        lines.push(`- ${note.payeeName} senedi eklendi: ${formatKurus(note.amountKurus)}`);
      }
    }

    if (lines.length === 1) {
      lines.push('', 'Bu dönemde işlem yok.');
    }

    return lines.join('\n');
  }
}
