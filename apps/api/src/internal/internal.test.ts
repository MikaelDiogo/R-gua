import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MonitorsService } from '../monitors/monitors.service';
import { InternalController } from './internal.controller';

const make = () => {
  const runDue = vi.fn(async () => ({ ran: 2, failed: 0 }));
  return { ctl: new InternalController({ runDue } as unknown as MonitorsService), runDue };
};

describe('POST /v1/internal/tick', () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('não existe sem CRON_SECRET (404) e não roda nada', async () => {
    const { ctl, runDue } = make();
    await expect(ctl.tick('qualquer')).rejects.toThrow();
    expect(runDue).not.toHaveBeenCalled();
  });

  it('recusa segredo errado ou ausente', async () => {
    process.env.CRON_SECRET = 'a'.repeat(32);
    const { ctl, runDue } = make();
    await expect(ctl.tick('b'.repeat(32))).rejects.toThrow();
    await expect(ctl.tick(undefined)).rejects.toThrow();
    expect(runDue).not.toHaveBeenCalled();
  });

  it('com o segredo certo roda os monitores vencidos', async () => {
    process.env.CRON_SECRET = 'a'.repeat(32);
    const { ctl, runDue } = make();
    await expect(ctl.tick('a'.repeat(32))).resolves.toEqual({ ran: 2, failed: 0 });
    expect(runDue).toHaveBeenCalledOnce();
  });
});
