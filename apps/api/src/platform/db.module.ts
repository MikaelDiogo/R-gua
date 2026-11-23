import { createPool, type Db } from '@agora/db';
import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';

export const DB = Symbol('DB');
export const InjectDb = () => Inject(DB);

/** Relógio do servidor: único autoritativo para prazos (docs/04 §4). Injetável para teste. */
export const CLOCK = Symbol('CLOCK');
export type Clock = () => Date;
export const InjectClock = () => Inject(CLOCK);

@Global()
@Module({
  providers: [
    { provide: DB, useFactory: (): Db => createPool('app') },
    { provide: CLOCK, useValue: (() => new Date()) as Clock },
  ],
  exports: [DB, CLOCK],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(DB) private readonly db: Db) {}
  async onApplicationShutdown() {
    await this.db.end();
  }
}
