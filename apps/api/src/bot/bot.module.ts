import { Global, Module } from '@nestjs/common';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { BotDispatcher } from '../whatsapp/whatsapp.types';
import { BotRouterService } from './bot-router.service';
import { BotSessionService } from './bot-session.service';
import { FlowRegistry } from './flow-registry.service';
import { MainMenuFlow } from './flows/main-menu.flow';

/**
 * Global so that the WhatsApp webhook (in its own module) can resolve the
 * BotDispatcher binding without a circular module import.
 */
@Global()
@Module({
  imports: [WhatsappModule],
  providers: [
    FlowRegistry,
    BotSessionService,
    BotRouterService,
    { provide: BotDispatcher, useExisting: BotRouterService },
    MainMenuFlow,
  ],
  exports: [BotDispatcher],
})
export class BotModule {}
