import { Injectable } from '@nestjs/common';
import { BotState } from '../bot-state.enum';
import { FlowContext, FlowResult } from '../bot.types';
import { FlowRegistry } from '../flow-registry.service';
import { TEXTS } from '../texts';

@Injectable()
export class MainMenuFlow {
  constructor(registry: FlowRegistry) {
    registry.register(BotState.MAIN_MENU, {
      prompt: () => [TEXTS.mainMenu],
      handle: (ctx) => this.handle(ctx),
    });
  }

  private async handle(ctx: FlowContext): Promise<FlowResult> {
    switch (ctx.input) {
      case '1':
        return { nextState: BotState.CUSTOMER_MENU };
      case '2':
        return { nextState: BotState.NOTES_MENU };
      case '3':
        return { nextState: BotState.REPORTS_MENU };
      case '4':
        return { nextState: BotState.CORRECTION_MENU };
      case '5':
        return { replies: [TEXTS.help], reprompt: true };
      default:
        return { replies: [TEXTS.invalidOption], reprompt: true };
    }
  }
}
