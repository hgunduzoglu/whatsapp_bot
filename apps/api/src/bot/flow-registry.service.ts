import { Injectable } from '@nestjs/common';
import { BotState } from './bot-state.enum';
import {
  CustomerPickedHandler,
  CustomerPickPurpose,
  DateCompletedHandler,
  DateEntryPurpose,
  StateDefinition,
} from './bot.types';

/**
 * Central registry of state handlers. Flow classes register their states at
 * construction time, which keeps each flow self-contained and the router
 * generic.
 */
@Injectable()
export class FlowRegistry {
  private readonly states = new Map<BotState, StateDefinition>();
  private readonly customerPickedHandlers = new Map<CustomerPickPurpose, CustomerPickedHandler>();
  private readonly dateCompletedHandlers = new Map<DateEntryPurpose, DateCompletedHandler>();

  register(state: BotState, definition: StateDefinition): void {
    if (this.states.has(state)) {
      throw new Error(`State ${state} is registered twice`);
    }
    this.states.set(state, definition);
  }

  get(state: BotState): StateDefinition | undefined {
    return this.states.get(state);
  }

  /** Continuation invoked by the shared customer picker. */
  registerCustomerPicked(purpose: CustomerPickPurpose, handler: CustomerPickedHandler): void {
    this.customerPickedHandlers.set(purpose, handler);
  }

  getCustomerPicked(purpose: CustomerPickPurpose): CustomerPickedHandler | undefined {
    return this.customerPickedHandlers.get(purpose);
  }

  /** Continuation invoked by the shared manual date entry. */
  registerDateCompleted(purpose: DateEntryPurpose, handler: DateCompletedHandler): void {
    this.dateCompletedHandlers.set(purpose, handler);
  }

  getDateCompleted(purpose: DateEntryPurpose): DateCompletedHandler | undefined {
    return this.dateCompletedHandlers.get(purpose);
  }
}
