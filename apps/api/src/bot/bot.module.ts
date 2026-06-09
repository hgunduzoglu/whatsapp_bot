import { Global, Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { MonetaryLedgerModule } from '../monetary-ledger/monetary-ledger.module';
import { ProductDebtsModule } from '../product-debts/product-debts.module';
import { ProductPaymentsModule } from '../product-payments/product-payments.module';
import { PromissoryNotesModule } from '../promissory-notes/promissory-notes.module';
import { ReportsModule } from '../reports/reports.module';
import { SeedlingsModule } from '../seedlings/seedlings.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BotDispatcher } from '../whatsapp/whatsapp.types';
import { BotRouterService } from './bot-router.service';
import { BotSessionService } from './bot-session.service';
import { FlowRegistry } from './flow-registry.service';
import { CustomerFlow } from './flows/customer.flow';
import { DateEntryFlow } from './flows/date-entry.flow';
import { MainMenuFlow } from './flows/main-menu.flow';
import { MonetaryFlow } from './flows/monetary.flow';
import { ProductDebtFlow } from './flows/product-debt.flow';
import { ProductPaymentFlow } from './flows/product-payment.flow';
import { PromissoryNoteFlow } from './flows/promissory-note.flow';
import { ReportFlow } from './flows/report.flow';
import { SeedlingDebtFlow } from './flows/seedling-debt.flow';
import { SeedlingOrderFlow } from './flows/seedling-order.flow';

/**
 * Global so that the WhatsApp webhook (in its own module) can resolve the
 * BotDispatcher binding without a circular module import.
 */
@Global()
@Module({
  imports: [
    WhatsappModule,
    CustomersModule,
    MonetaryLedgerModule,
    ProductDebtsModule,
    ProductPaymentsModule,
    SeedlingsModule,
    PromissoryNotesModule,
    ReportsModule,
  ],
  providers: [
    FlowRegistry,
    BotSessionService,
    BotRouterService,
    { provide: BotDispatcher, useExisting: BotRouterService },
    MainMenuFlow,
    CustomerFlow,
    MonetaryFlow,
    ProductDebtFlow,
    ProductPaymentFlow,
    DateEntryFlow,
    SeedlingOrderFlow,
    SeedlingDebtFlow,
    PromissoryNoteFlow,
    ReportFlow,
  ],
  exports: [BotDispatcher],
})
export class BotModule {}
