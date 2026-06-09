/** Minimal typing for the Meta WhatsApp Cloud API webhook payload. */

export interface WebhookPayload {
  object?: string;
  entry?: WebhookEntry[];
}

export interface WebhookEntry {
  id?: string;
  changes?: WebhookChange[];
}

export interface WebhookChange {
  field?: string;
  value?: WebhookValue;
}

export interface WebhookValue {
  messaging_product?: string;
  messages?: WebhookMessage[];
  statuses?: unknown[];
}

export interface WebhookMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    type?: string;
    list_reply?: { id?: string; title?: string };
    button_reply?: { id?: string; title?: string };
  };
}

/** Normalized inbound message handed to the bot. */
export interface IncomingBotMessage {
  messageId: string;
  /** Sender phone, digits only (no plus sign). */
  from: string;
  /** Text content; for interactive replies this is the selected option id/title. */
  text: string;
}

/**
 * Implemented by the bot module. The WhatsApp webhook hands authorized,
 * deduplicated messages to this dispatcher.
 */
export abstract class BotDispatcher {
  abstract dispatch(message: IncomingBotMessage): Promise<void>;
}
