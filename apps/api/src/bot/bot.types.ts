import { BotState } from './bot-state.enum';

/** Free-form per-conversation scratch data, persisted as JSON. */
export type SessionData = Record<string, unknown>;

export interface FlowContext {
  /** Sender phone, digits only. */
  phone: string;
  /** Trimmed user input for handle(); empty string when rendering prompts. */
  input: string;
  state: BotState;
  data: SessionData;
  selectedCustomerId: string | null;
}

export interface FlowResult {
  /** Extra messages to send before the next state's prompt. */
  replies?: string[];
  /** Target state; omit to stay in the current state. */
  nextState?: BotState;
  /** Keys merged into the session data. */
  data?: SessionData;
  /** Clears all session data (except navigation history). */
  resetData?: boolean;
  /** Sets or clears the selected customer. */
  selectedCustomerId?: string | null;
  /** When staying in the same state, re-render the prompt after the replies. */
  reprompt?: boolean;
}

export interface StateDefinition {
  /** Renders the message(s) shown when this state becomes active. */
  prompt(ctx: FlowContext): Promise<string[]> | string[];
  /** Handles user input while this state is active. */
  handle(ctx: FlowContext): Promise<FlowResult>;
}

/**
 * Purposes for the shared customer picker. Each purpose has a continuation
 * registered by the flow that owns it.
 */
export type CustomerPickPurpose = 'ACTIONS' | 'STATEMENT' | 'ADJUSTMENT';

/** Purposes for the shared manual date entry. */
export type DateEntryPurpose = 'SEEDLING_PICKUP' | 'NOTE_DUE' | 'STATEMENT_FROM' | 'STATEMENT_TO';

export type CustomerPickedHandler = (
  ctx: FlowContext,
  customerId: string,
) => Promise<FlowResult>;

export type DateCompletedHandler = (ctx: FlowContext, date: Date) => Promise<FlowResult>;
