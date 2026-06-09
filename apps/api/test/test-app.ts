import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { WhatsappSenderService } from '../src/whatsapp/whatsapp-sender.service';

/** Captures outgoing messages instead of calling the Meta API. */
export class FakeWhatsappSender {
  sent: { to: string; text: string }[] = [];

  async sendText(to: string, text: string): Promise<void> {
    this.sent.push({ to, text });
  }

  async sendTemplate(): Promise<void> {
    // not exercised in integration tests
  }
}

export interface TestApp {
  app: INestApplication;
  prisma: PrismaService;
  sender: FakeWhatsappSender;
}

export async function createTestApp(): Promise<TestApp> {
  const sender = new FakeWhatsappSender();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WhatsappSenderService)
    .useValue(sender)
    .compile();

  const app = moduleRef.createNestApplication();
  await app.init();
  return { app, prisma: app.get(PrismaService), sender };
}

/** Empties every domain table between tests. */
export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AuditLog",
      "Reminder",
      "IncomingWhatsappMessage",
      "BotSession",
      "ProductPaymentItem",
      "ProductPayment",
      "ProductPurchaseItem",
      "ProductPurchase",
      "Product",
      "MonetaryLedgerEntry",
      "SeedlingOrder",
      "PromissoryNote",
      "Customer",
      "AppUser"
    CASCADE
  `);
}
