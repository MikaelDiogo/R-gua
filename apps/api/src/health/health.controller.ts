import type { Db } from '@agora/db';
import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { InjectDb } from '../platform/db.module';

@Controller('v1')
export class HealthController {
  constructor(@InjectDb() private readonly db: Db) {}

  /** Readiness: só responde ok se o banco responde. Sem detalhes na resposta (não vaza topologia). */
  @Public()
  @Get('healthz')
  async ready() {
    try {
      await this.db.query('SELECT 1');
    } catch {
      throw new ServiceUnavailableException('indisponível');
    }
    return { status: 'ok' };
  }

  /** Liveness: o processo responde. Readiness (banco, Redis) entra com a camada de dados. */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', service: 'agora-api', server_now: new Date().toISOString() };
  }
}
