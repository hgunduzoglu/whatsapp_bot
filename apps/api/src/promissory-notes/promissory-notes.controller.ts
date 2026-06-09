import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { PromissoryNote } from '@prisma/client';
import { z } from 'zod';
import { adminActor, CurrentUser } from '../auth/current-user.decorator';
import { JwtPayload } from '../auth/jwt-auth.guard';
import { dateString, positiveInt } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import { PromissoryNotesService } from './promissory-notes.service';

const createSchema = z.object({
  payeeName: z.string().min(1).max(120),
  amountKurus: positiveInt,
  dueDate: dateString,
  note: z.string().max(300).nullish(),
});

const voidSchema = z.object({ reason: z.string().max(300).nullish() });
const deleteSchema = z.object({ reason: z.string().min(1).max(300) });

@Controller('promissory-notes')
export class PromissoryNotesController {
  constructor(private readonly notes: PromissoryNotesService) {}

  /** view=pending (default) | paid | upcoming */
  @Get()
  async list(@Query('view') view?: string): Promise<PromissoryNote[]> {
    if (view === 'paid') {
      return this.notes.listPaid(100);
    }
    if (view === 'upcoming') {
      return this.notes.listUpcoming(30);
    }
    return this.notes.listPending();
  }

  @Post()
  async create(@Body() body: unknown, @CurrentUser() user: JwtPayload): Promise<PromissoryNote> {
    const input = zParse(createSchema, body);
    return this.notes.create({ ...input, actorPhone: adminActor(user) });
  }

  @Post(':id/mark-paid')
  async markPaid(@Param('id') id: string, @CurrentUser() user: JwtPayload): Promise<PromissoryNote> {
    return this.notes.markPaid(id, adminActor(user));
  }

  @Post(':id/void')
  async voidNote(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(voidSchema, body ?? {});
    await this.notes.voidNote(id, reason ?? null, adminActor(user));
    return { ok: true };
  }

  @Delete(':id')
  async deleteNote(
    @Param('id') id: string,
    @Body() body: unknown,
    @CurrentUser() user: JwtPayload,
  ): Promise<{ ok: true }> {
    const { reason } = zParse(deleteSchema, body);
    await this.notes.softDeleteNote(id, reason, adminActor(user));
    return { ok: true };
  }
}
