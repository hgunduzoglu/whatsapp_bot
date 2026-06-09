import { Controller, Get, Param, Query } from '@nestjs/common';
import { dateString } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import {
  ActivitySummary,
  CustomerStatement,
  ReceivableLine,
  ReportsService,
} from './reports.service';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  async daily(): Promise<ActivitySummary> {
    return this.reports.dailySummary();
  }

  @Get('weekly')
  async weekly(): Promise<ActivitySummary> {
    return this.reports.weeklySummary();
  }

  @Get('receivables')
  async receivables(): Promise<{ total: number; lines: ReceivableLine[] }> {
    return this.reports.receivables();
  }

  @Get('open-product-debts')
  async openProductDebts(): Promise<Awaited<ReturnType<ReportsService['openProductDebts']>>> {
    return this.reports.openProductDebts();
  }

  @Get('upcoming-seedlings')
  async upcomingSeedlings(): Promise<
    Awaited<ReturnType<ReportsService['upcomingSeedlingDeliveries']>>
  > {
    return this.reports.upcomingSeedlingDeliveries(30);
  }

  @Get('upcoming-promissory-notes')
  async upcomingNotes(): Promise<Awaited<ReturnType<ReportsService['upcomingPromissoryNotes']>>> {
    return this.reports.upcomingPromissoryNotes(30);
  }

  @Get('customers/:id/statement')
  async statement(
    @Param('id') customerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<CustomerStatement> {
    const range = {
      from: from ? zParse(dateString, from) : undefined,
      to: to ? zParse(dateString, to) : undefined,
    };
    return this.reports.customerStatement(customerId, range);
  }
}

export interface DashboardData {
  totalReceivablesKurus: number;
  receivableCustomerCount: number;
  openProductDebtCustomerCount: number;
  upcomingSeedlingCount: number;
  upcomingNoteCount: number;
  todayDebtsKurus: number;
  todayPaymentsKurus: number;
}

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  async dashboard(): Promise<DashboardData> {
    const [receivables, openItems, seedlings, notes, daily] = await Promise.all([
      this.reports.receivables(),
      this.reports.openProductDebts(),
      this.reports.upcomingSeedlingDeliveries(30),
      this.reports.upcomingPromissoryNotes(30),
      this.reports.dailySummary(),
    ]);

    const openDebtCustomers = new Set(
      openItems.map(
        (item) =>
          `${item.productPurchase.customer.baseName}|${item.productPurchase.customer.identifier ?? ''}`,
      ),
    );

    const todayDebtsKurus = daily.monetaryEntries
      .filter((entry) => entry.type === 'DEBT')
      .reduce((sum, entry) => sum + entry.amountKurus, 0);
    const todayPaymentsKurus = daily.monetaryEntries
      .filter((entry) => entry.type === 'PAYMENT')
      .reduce((sum, entry) => sum + entry.amountKurus, 0);

    return {
      totalReceivablesKurus: receivables.total,
      receivableCustomerCount: receivables.lines.length,
      openProductDebtCustomerCount: openDebtCustomers.size,
      upcomingSeedlingCount: seedlings.length,
      upcomingNoteCount: notes.length,
      todayDebtsKurus,
      todayPaymentsKurus,
    };
  }
}
