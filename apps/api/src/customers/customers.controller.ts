import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { Customer, CustomerStatus } from '@prisma/client';
import { z } from 'zod';
import { adminActor, CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { skipQuery, takeQuery } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import { MonetaryLedgerService } from '../monetary-ledger/monetary-ledger.service';
import { CustomersService } from './customers.service';

const createSchema = z.object({
  baseName: z.string().min(1).max(120),
  identifier: z.string().max(120).nullish(),
  phone: z.string().max(20).nullish(),
  note: z.string().max(500).nullish(),
});

const updateSchema = z.object({
  baseName: z.string().min(1).max(120).optional(),
  identifier: z.string().max(120).nullish(),
  phone: z.string().max(20).nullish(),
  note: z.string().max(500).nullish(),
  status: z.enum([CustomerStatus.ACTIVE, CustomerStatus.PASSIVE]).optional(),
});

const deleteSchema = z.object({ reason: z.string().min(1).max(300) });

type CustomerWithBalance = Customer & { balanceKurus: number };

@Controller('customers')
export class CustomersController {
  constructor(
    private readonly customers: CustomersService,
    private readonly ledger: MonetaryLedgerService,
  ) {}

  @Get()
  async list(
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ): Promise<{ items: CustomerWithBalance[]; total: number }> {
    const { items, total } = await this.customers.list(
      q,
      zParse(takeQuery, take),
      zParse(skipQuery, skip),
    );
    const balances = await this.ledger.balancesByCustomer();
    return {
      items: items.map((customer) => ({
        ...customer,
        balanceKurus: balances.get(customer.id) ?? 0,
      })),
      total,
    };
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload): Promise<Customer> {
    const input = zParse(createSchema, body);
    return this.customers.create({ ...input, actorPhone: adminActor(user) });
  }

  @Get(':id')
  async get(@Param('id') id: string): Promise<CustomerWithBalance> {
    const customer = await this.customers.getById(id);
    const balanceKurus = await this.ledger.balance(id);
    return { ...customer, balanceKurus };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<Customer> {
    const input = zParse(updateSchema, body);
    return this.customers.update(id, { ...input, actorPhone: adminActor(user) });
  }

  @Delete(':id')
  async remove(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(deleteSchema, body);
    await this.customers.softDelete(id, reason, adminActor(user));
    return { ok: true };
  }
}
