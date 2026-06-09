import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { MonetaryLedgerEntry, MonetaryLedgerSource } from '@prisma/client';
import { z } from 'zod';
import { adminActor, CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { dateString, positiveInt } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import { MonetaryLedgerService } from './monetary-ledger.service';

const entrySchema = z.object({
  amountKurus: positiveInt,
  description: z.string().max(300).nullish(),
  businessDate: dateString.optional(),
});

const adjustmentSchema = z.object({
  direction: z.enum(['INCREASE', 'DECREASE']),
  amountKurus: positiveInt,
  reason: z.string().min(1).max(300),
});

const voidSchema = z.object({ reason: z.string().max(300).nullish() });
const deleteSchema = z.object({ reason: z.string().min(1).max(300) });

@Controller()
export class MonetaryLedgerController {
  constructor(private readonly ledger: MonetaryLedgerService) {}

  @Get('customers/:id/monetary-ledger')
  async list(@Param('id') customerId: string): Promise<MonetaryLedgerEntry[]> {
    return this.ledger.entriesForCustomer(customerId);
  }

  @Post('customers/:id/monetary-debts')
  async addDebt(
    @Param('id') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<MonetaryLedgerEntry> {
    const input = zParse(entrySchema, body);
    return this.ledger.addDebt({
      customerId,
      ...input,
      source: MonetaryLedgerSource.ADMIN_PANEL,
      actorPhone: adminActor(user),
    });
  }

  @Post('customers/:id/monetary-payments')
  async addPayment(
    @Param('id') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<MonetaryLedgerEntry> {
    const input = zParse(entrySchema, body);
    return this.ledger.addPayment({
      customerId,
      ...input,
      source: MonetaryLedgerSource.ADMIN_PANEL,
      actorPhone: adminActor(user),
    });
  }

  @Post('customers/:id/monetary-adjustments')
  async addAdjustment(
    @Param('id') customerId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<MonetaryLedgerEntry> {
    const input = zParse(adjustmentSchema, body);
    return this.ledger.addAdjustment(input.direction, {
      customerId,
      amountKurus: input.amountKurus,
      description: input.reason,
      actorPhone: adminActor(user),
    });
  }

  @Post('monetary-ledger/:entryId/void')
  async voidEntry(
    @Param('entryId') entryId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<MonetaryLedgerEntry> {
    const { reason } = zParse(voidSchema, body ?? {});
    return this.ledger.voidEntry(entryId, reason ?? null, adminActor(user));
  }

  @Delete('monetary-ledger/:entryId')
  async deleteEntry(
    @Param('entryId') entryId: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(deleteSchema, body);
    await this.ledger.softDeleteEntry(entryId, reason, adminActor(user));
    return { ok: true };
  }
}
