import { PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';

/** Valida o corpo com um schema `.strict()` do `@agora/contracts`; erro vira `validation_failed` (422). */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
