import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  action: string;
  entityType: string;
  entityId: string;
  actorPhone?: string | null;
  userId?: string | null;
  oldValue?: Prisma.InputJsonValue;
  newValue?: Prisma.InputJsonValue;
  reason?: string | null;
}

/** Prisma client or transaction client — lets audit writes join transactions. */
export type PrismaClientLike = Prisma.TransactionClient;

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry, tx?: PrismaClientLike): Promise<void> {
    const client = tx ?? this.prisma;
    await client.auditLog.create({
      data: {
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        actorPhone: entry.actorPhone ?? null,
        userId: entry.userId ?? null,
        oldValue: entry.oldValue,
        newValue: entry.newValue,
        reason: entry.reason ?? null,
      },
    });
  }
}
