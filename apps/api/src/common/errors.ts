/**
 * Domain errors thrown by business services. Bot flows catch these and turn
 * them into user-friendly Turkish messages.
 */

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class DuplicateCustomerError extends DomainError {
  constructor(public readonly baseName: string) {
    super(`A customer named "${baseName}" already exists`);
  }
}

export class EntityNotFoundError extends DomainError {
  constructor(entityType: string, id: string) {
    super(`${entityType} ${id} not found`);
  }
}

export class AlreadyVoidedError extends DomainError {
  constructor(entityType: string, id: string) {
    super(`${entityType} ${id} is already voided`);
  }
}

export class ExcessiveQuantityError extends DomainError {
  constructor(
    public readonly requested: number,
    public readonly available: number,
  ) {
    super(`Cannot settle ${requested}: only ${available} is open`);
  }
}

export class HasActivePaymentsError extends DomainError {
  constructor(entityType: string, id: string) {
    super(`${entityType} ${id} has active payments and cannot be voided first`);
  }
}
