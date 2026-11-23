import { timingSafeEqual } from 'node:crypto';
import { Controller, Headers, HttpCode, NotFoundException, Post } from '@nestjs/common';
import { Public } from '../auth/auth.guard';
import { MonitorsService } from '../monitors/monitors.service';
import { DomainError } from '../platform/problem.filter';

const same = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Chamado por um agendador externo (GitHub Actions) em hospedagem que dorme sem tráfego: acorda a API e
 * roda os monitores vencidos. Sem CRON_SECRET configurado a rota não existe (404); com segredo errado, 403.
 */
@Controller('v1/internal')
export class InternalController {
  constructor(private readonly monitors: MonitorsService) {}

  @Public()
  @Post('tick')
  @HttpCode(200)
  async tick(@Headers('x-cron-secret') secret?: string) {
    const expected = process.env.CRON_SECRET;
    if (!expected || expected.length < 24) throw new NotFoundException();
    if (!secret || !same(secret, expected)) throw new DomainError('forbidden', 'Segredo inválido.');
    return this.monitors.runDue();
  }
}
