import { BotRouterService } from './bot-router.service';
import { BotSessionService, SessionView } from './bot-session.service';
import { BotState } from './bot-state.enum';
import { FlowRegistry } from './flow-registry.service';
import { MainMenuFlow } from './flows/main-menu.flow';
import { TEXTS } from './texts';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';

class FakeSessionService {
  store = new Map<string, SessionView>();

  async load(phone: string): Promise<SessionView> {
    const existing = this.store.get(phone);
    if (!existing) {
      return {
        state: BotState.MAIN_MENU,
        data: {},
        selectedCustomerId: null,
        history: [],
        isNew: true,
        isExpired: false,
      };
    }
    return { ...existing, data: { ...existing.data }, history: [...existing.history] };
  }

  async save(phone: string, view: SessionView): Promise<void> {
    this.store.set(phone, { ...view, isNew: false, isExpired: false });
  }
}

describe('BotRouterService', () => {
  let router: BotRouterService;
  let sessions: FakeSessionService;
  let registry: FlowRegistry;
  const phone = '905000000001';

  beforeEach(() => {
    sessions = new FakeSessionService();
    registry = new FlowRegistry();
    new MainMenuFlow(registry);
    // Minimal stub so the main menu can navigate somewhere
    registry.register(BotState.CUSTOMER_MENU, {
      prompt: () => [TEXTS.customerMenu],
      handle: async () => ({ replies: ['stub'] }),
    });

    const sender = { sendText: jest.fn() } as unknown as WhatsappSenderService;
    router = new BotRouterService(
      sessions as unknown as BotSessionService,
      registry,
      sender,
    );
  });

  it('greets new users with the main menu', async () => {
    const replies = await router.handleMessage({ messageId: 'm1', from: phone, text: 'merhaba' });
    expect(replies[0]).toBe(TEXTS.welcome);
    expect(replies[1]).toBe(TEXTS.mainMenu);
  });

  it('navigates from main menu to customer menu', async () => {
    await router.handleMessage({ messageId: 'm1', from: phone, text: 'selam' });
    const replies = await router.handleMessage({ messageId: 'm2', from: phone, text: '1' });
    expect(replies).toContain(TEXTS.customerMenu);
    expect(sessions.store.get(phone)?.state).toBe(BotState.CUSTOMER_MENU);
  });

  it('rejects invalid menu choices and repeats the menu', async () => {
    await router.handleMessage({ messageId: 'm1', from: phone, text: 'selam' });
    const replies = await router.handleMessage({ messageId: 'm2', from: phone, text: '99' });
    expect(replies[0]).toBe(TEXTS.invalidOption);
    expect(replies[1]).toBe(TEXTS.mainMenu);
  });

  it('handles the global cancel command from any state', async () => {
    await router.handleMessage({ messageId: 'm1', from: phone, text: 'selam' });
    await router.handleMessage({ messageId: 'm2', from: phone, text: '1' });
    const replies = await router.handleMessage({ messageId: 'm3', from: phone, text: 'iptal' });
    expect(replies[0]).toBe(TEXTS.operationCancelled);
    expect(replies[1]).toBe(TEXTS.mainMenu);
    expect(sessions.store.get(phone)?.state).toBe(BotState.MAIN_MENU);
  });

  it('handles the global back command using navigation history', async () => {
    await router.handleMessage({ messageId: 'm1', from: phone, text: 'selam' });
    await router.handleMessage({ messageId: 'm2', from: phone, text: '1' });
    const replies = await router.handleMessage({ messageId: 'm3', from: phone, text: 'geri' });
    expect(replies).toContain(TEXTS.mainMenu);
    expect(sessions.store.get(phone)?.state).toBe(BotState.MAIN_MENU);
  });

  it('shows help and re-renders the current prompt', async () => {
    await router.handleMessage({ messageId: 'm1', from: phone, text: 'selam' });
    const replies = await router.handleMessage({ messageId: 'm2', from: phone, text: 'yardım' });
    expect(replies[0]).toBe(TEXTS.help);
    expect(replies[1]).toBe(TEXTS.mainMenu);
  });

  it('resets expired sessions to the main menu', async () => {
    await router.handleMessage({ messageId: 'm1', from: phone, text: 'selam' });
    await router.handleMessage({ messageId: 'm2', from: phone, text: '1' });
    const stored = sessions.store.get(phone) as SessionView;
    sessions.store.set(phone, { ...stored, isExpired: true });

    const replies = await router.handleMessage({ messageId: 'm3', from: phone, text: '1' });
    expect(replies[0]).toBe(TEXTS.sessionExpired);
    expect(replies[1]).toBe(TEXTS.mainMenu);
  });

  it('falls back to the main menu for unimplemented states', async () => {
    await router.handleMessage({ messageId: 'm1', from: phone, text: 'selam' });
    const stored = sessions.store.get(phone) as SessionView;
    sessions.store.set(phone, { ...stored, state: BotState.REPORTS_MENU });

    const replies = await router.handleMessage({ messageId: 'm2', from: phone, text: '1' });
    expect(replies[0]).toBe(TEXTS.notImplemented);
    expect(replies[1]).toBe(TEXTS.mainMenu);
  });
});
