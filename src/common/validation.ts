import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

function fieldErrors(errors: ValidationError[], parent = ''): { field: string; rules: string[] }[] {
  return errors.flatMap((error) => {
    const field = parent ? `${parent}.${error.property}` : error.property;
    return [
      ...(error.constraints ? [{ field, rules: Object.keys(error.constraints) }] : []),
      ...fieldErrors(error.children ?? [], field),
    ];
  });
}

export function createValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    forbidUnknownValues: true,
    transform: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: fieldErrors(errors),
      }),
  });
}
