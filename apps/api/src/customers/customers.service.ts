import { Injectable } from '@nestjs/common';
import { Customer, CustomerStatus } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { DuplicateCustomerError, EntityNotFoundError } from '../common/errors';
import { customerLabel, normalizeName } from '../common/utils/normalize.util';
import { PrismaService } from '../prisma/prisma.service';

export interface CreateCustomerInput {
  baseName: string;
  identifier?: string | null;
  phone?: string | null;
  note?: string | null;
  actorPhone?: string | null;
}

const MAX_SEARCH_RESULTS = 9;

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Creates a customer. When a customer with the same normalized base name and
   * identifier already exists, throws DuplicateCustomerError — the caller is
   * expected to ask for a distinguishing identifier and retry.
   */
  async create(input: CreateCustomerInput): Promise<Customer> {
    const baseName = input.baseName.trim().replace(/\s+/g, ' ');
    const identifier = input.identifier?.trim().replace(/\s+/g, ' ') || null;

    const normalizedBaseName = normalizeName(baseName);
    const normalizedIdentifier = identifier ? normalizeName(identifier) : '';

    const existing = await this.prisma.customer.findUnique({
      where: {
        normalizedBaseName_normalizedIdentifier: { normalizedBaseName, normalizedIdentifier },
      },
    });
    if (existing && existing.deletedAt === null) {
      throw new DuplicateCustomerError(customerLabel(baseName, identifier));
    }

    const customer = await this.prisma.customer.create({
      data: {
        baseName,
        identifier,
        normalizedBaseName,
        normalizedIdentifier,
        phone: input.phone?.trim() || null,
        note: input.note?.trim() || null,
      },
    });

    await this.audit.record({
      action: 'CUSTOMER_CREATED',
      entityType: 'Customer',
      entityId: customer.id,
      actorPhone: input.actorPhone,
      newValue: { baseName, identifier, phone: customer.phone, note: customer.note },
    });

    return customer;
  }

  /** True when at least one active customer shares this base name. */
  async baseNameExists(baseName: string): Promise<boolean> {
    const count = await this.prisma.customer.count({
      where: {
        normalizedBaseName: normalizeName(baseName),
        deletedAt: null,
        status: { not: CustomerStatus.DELETED },
      },
    });
    return count > 0;
  }

  /** Search by partial name match on the normalized base name + identifier. */
  async search(query: string): Promise<Customer[]> {
    const normalized = normalizeName(query);
    if (normalized.length === 0) {
      return [];
    }
    return this.prisma.customer.findMany({
      where: {
        deletedAt: null,
        status: { not: CustomerStatus.DELETED },
        OR: [
          { normalizedBaseName: { contains: normalized } },
          { normalizedIdentifier: { contains: normalized } },
        ],
      },
      orderBy: [{ normalizedBaseName: 'asc' }, { normalizedIdentifier: 'asc' }],
      take: MAX_SEARCH_RESULTS,
    });
  }

  async getById(id: string): Promise<Customer> {
    const customer = await this.prisma.customer.findFirst({
      where: { id, deletedAt: null },
    });
    if (!customer) {
      throw new EntityNotFoundError('Customer', id);
    }
    return customer;
  }

  label(customer: Pick<Customer, 'baseName' | 'identifier'>): string {
    return customerLabel(customer.baseName, customer.identifier);
  }
}
