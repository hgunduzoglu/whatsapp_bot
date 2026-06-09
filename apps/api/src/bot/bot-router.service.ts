import { Injectable, Logger } from '@nestjs/common';
import {
  DomainError,
  DuplicateCustomerError,
  ExcessiveQuantityError,
  HasActivePaymentsError,
} from '../common/errors';
import { normalizeName } from '../common/utils/normalize.util';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import { BotDispatcher, IncomingBotMessage } from '../whatsapp/whatsapp.types';
import { BotSessionService, SessionView } from './bot-session.service';
import { BotState } from './bot-state.enum';
import { FlowContext, FlowResult } from './bot.types';
import { FlowRegistry } from './flow-registry.service';
import { TEXTS } from './texts';

const CANCEL_COMMANDS = new Set(['iptal']);
const MAIN_MENU_COMMANDS = new Set(['ana menu', 'menu', 'ana sayfa']);
const BACK_COMMANDS = new Set(['geri']);
const HELP_COMMANDS = new Set(['yardim', 'help']);

@Injectable()
export class BotRouterService implements BotDispatcher {
  private readonly logger = new Logger(BotRouterService.name);

  constructor(
    private readonly sessions: BotSessionService,
    private readonly registry: FlowRegistry,
    private readonly sender: WhatsappSenderService,
  ) {}

  async dispatch(message: IncomingBotMessage): Promise<void> {
    const replies = await this.handleMessage(message);
    for (const reply of replies) {
      await this.sender.sendText(message.from, reply);
    }
  }

  /** Processes one message and returns the replies. Exposed for tests. */
  async handleMessage(message: IncomingBotMessage): Promise<string[]> {
    const session = await this.sessions.load(message.from);
    const input = message.text.trim();
    const replies: string[] = [];

    if (session.isNew) {
      replies.push(TEXTS.welcome);
      this.resetToMainMenu(session);
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    if (session.isExpired) {
      replies.push(TEXTS.sessionExpired);
      this.resetToMainMenu(session);
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    const command = normalizeName(input);

    if (CANCEL_COMMANDS.has(command)) {
      replies.push(TEXTS.operationCancelled);
      this.resetToMainMenu(session);
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    if (MAIN_MENU_COMMANDS.has(command)) {
      this.resetToMainMenu(session);
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    if (HELP_COMMANDS.has(command)) {
      replies.push(TEXTS.help);
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    if (BACK_COMMANDS.has(command)) {
      const previous = session.history.pop();
      if (previous) {
        session.state = previous;
      } else {
        this.resetToMainMenu(session);
      }
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    const definition = this.registry.get(session.state);
    if (!definition) {
      this.logger.warn(`No handler registered for state ${session.state}`);
      replies.push(TEXTS.notImplemented);
      this.resetToMainMenu(session);
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    const ctx: FlowContext = {
      phone: message.from,
      input,
      state: session.state,
      data: session.data,
      selectedCustomerId: session.selectedCustomerId,
    };

    let result: FlowResult;
    try {
      result = await definition.handle(ctx);
    } catch (error) {
      this.logger.error(
        `Handler for ${session.state} failed: ${(error as Error).message}`,
        (error as Error).stack,
      );
      replies.push(this.errorMessage(error));
      replies.push(...(await this.renderPrompt(session, message.from)));
      await this.sessions.save(message.from, session);
      return replies;
    }

    replies.push(...(result.replies ?? []));
    this.applyResult(session, result);

    if (result.nextState && result.nextState !== ctx.state) {
      replies.push(...(await this.renderPrompt(session, message.from)));
    } else if (result.reprompt) {
      replies.push(...(await this.renderPrompt(session, message.from)));
    }

    await this.sessions.save(message.from, session);
    return replies;
  }

  private applyResult(session: SessionView, result: FlowResult): void {
    if (result.resetData) {
      session.data = {};
    }
    if (result.data) {
      session.data = { ...session.data, ...result.data };
    }
    if (result.selectedCustomerId !== undefined) {
      session.selectedCustomerId = result.selectedCustomerId;
    }
    if (result.nextState && result.nextState !== session.state) {
      if (result.nextState === BotState.MAIN_MENU) {
        // Reaching the main menu always starts a clean navigation history
        session.history = [];
        session.data = {};
        session.selectedCustomerId = null;
      } else {
        session.history.push(session.state);
      }
      session.state = result.nextState;
    }
  }

  private resetToMainMenu(session: SessionView): void {
    session.state = BotState.MAIN_MENU;
    session.data = {};
    session.selectedCustomerId = null;
    session.history = [];
  }

  private async renderPrompt(session: SessionView, phone: string): Promise<string[]> {
    const definition = this.registry.get(session.state);
    if (!definition) {
      return [TEXTS.notImplemented];
    }
    const ctx: FlowContext = {
      phone,
      input: '',
      state: session.state,
      data: session.data,
      selectedCustomerId: session.selectedCustomerId,
    };
    try {
      return await definition.prompt(ctx);
    } catch (error) {
      this.logger.error(`Prompt for ${session.state} failed: ${(error as Error).message}`);
      return [TEXTS.genericError];
    }
  }

  private errorMessage(error: unknown): string {
    if (error instanceof DuplicateCustomerError) {
      return TEXTS.duplicateCustomer;
    }
    if (error instanceof ExcessiveQuantityError) {
      return TEXTS.excessiveQuantity;
    }
    if (error instanceof HasActivePaymentsError) {
      return TEXTS.cannotVoidPurchaseWithPayments;
    }
    if (error instanceof DomainError) {
      return TEXTS.genericError;
    }
    return TEXTS.genericError;
  }
}
