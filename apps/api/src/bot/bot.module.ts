import { Global, Module } from '@nestjs/common';
import { CustomersModule } from '../customers/customers.module';
import { MonetaryLedgerModule } from '../monetary-ledger/monetary-ledger.module';
import { ProductDebtsModule } from '../product-debts/product-debts.module';
import { ProductPaymentsModule } from '../product-payments/product-payments.module';
import { SeedlingsModule } from '../seedlings/seedlings.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BotDispatcher } from '../whatsapp/whatsapp.types';
import { BotRouterService } from './bot-router.service';
import { BotSessionService } from './bot-session.service';
import { FlowRegistry } from './flow-registry.service';
import { CustomerFlow } from './flows/customer.flow';
import { MainMenuFlow } from './flows/main-menu.flow';
import { MonetaryFlow } from './flows/monetary.flow';
import { ProductDebtFlow } from './flows/product-debt.flow';
import { ProductPaymentFlow } from './flows/product-payment.flow';

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
  ],
  exports: [BotDispatcher],
})
export class BotModule {}
