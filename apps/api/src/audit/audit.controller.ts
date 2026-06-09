import { Controller, Get, Query } from '@nestjs/common';
import { AuditLog } from '@prisma/client';
import { skipQuery, takeQuery } from '../common/rest.util';
import { zParse } from '../common/zod-validation';
import { PrismaService } from '../prisma/prisma.service';

@Controller('audit-logs')
export class AuditController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(
    @Query('take') take?: string,
    @Query('skip') skip?: string,
    @Query('entityType') entityType?: string,
  ): Promise<{ items: AuditLog[]; total: number }> {
    const where = entityType ? { entityType } : {};
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: zParse(takeQuery, take),
        skip: zParse(skipQuery, skip),
      }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total };
  }
}
