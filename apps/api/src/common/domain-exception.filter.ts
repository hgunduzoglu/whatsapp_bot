import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import {
  AlreadyVoidedError,
  DomainError,
  DuplicateCustomerError,
  EntityNotFoundError,
  ExcessiveQuantityError,
  HasActivePaymentsError,
} from './errors';

/** Maps typed domain errors to meaningful HTTP responses for the REST API. */
@Catch(DomainError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: DomainError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = this.statusFor(exception);
    response.status(status).json({
      statusCode: status,
      error: exception.name,
      message: exception.message,
    });
  }

  private statusFor(exception: DomainError): number {
    if (exception instanceof EntityNotFoundError) {
      return HttpStatus.NOT_FOUND;
    }
    if (
      exception instanceof DuplicateCustomerError ||
      exception instanceof AlreadyVoidedError ||
      exception instanceof ExcessiveQuantityError ||
      exception instanceof HasActivePaymentsError
    ) {
      return HttpStatus.CONFLICT;
    }
    return HttpStatus.BAD_REQUEST;
  }
}
