import { describe, expect, it } from 'vitest';
import { fakeDb } from './fake-db.test-util';
import { fakeFetch, json, testClient } from './pncp/helpers.test-util';
import { servePaged } from './pncp/serve.test-util';
import { verifyMunicipality } from './verify';

const IBGE = '2304103'; // Crateús
const NOW = new Date('2026-11-23T15:00:00Z');
const now = () => NOW;

describe('verifyMunicipality (conferência PNCP × banco, somente leitura)', () => {
  it('lista o que o PNCP tem e o banco não tem (6 no PNCP, 5 no banco → falta 1)', async () => {
    const { fn } = servePaged(6, 'V', IBGE);
    const { client } = testClient(fn);
    const f = fakeDb();
    // O banco já tem 5 das 6 (a 6ª, um pregão, nunca entrou).
    for (let i = 0; i < 5; i++) f.known.set(`V${String(i).padStart(10, '0')}-1-000001/2026`, 'h');
    const r = await verifyMunicipality(f.db, IBGE, { client, now, crossCheck: false });
    expect(r.pncp).toHaveLength(6);
    expect(r.inDb).toBe(5);
    expect(r.missing.map((m) => m.numeroControlePncp)).toEqual(['V0000000005-1-000001/2026']);
    expect(r.incomplete).toBe(false);
    // Somente leitura: nenhuma gravação.
    expect(f.log.some((q) => /INSERT|UPDATE|DELETE/i.test(q))).toBe(false);
  });

  it('banco completo → nada falta', async () => {
    const { fn } = servePaged(3, 'W', IBGE);
    const { client } = testClient(fn);
    const f = fakeDb();
    for (let i = 0; i < 3; i++) f.known.set(`W${String(i).padStart(10, '0')}-1-000001/2026`, 'h');
    const r = await verifyMunicipality(f.db, IBGE, { client, now, crossCheck: false });
    expect(r.missing).toEqual([]);
    expect(r.inDb).toBe(3);
  });

  it('confere também modalidade por modalidade e compara com a consulta sem filtro', async () => {
    const { fn, calls } = servePaged(2, 'X', IBGE);
    const { client } = testClient(fn);
    const r = await verifyMunicipality(fakeDb().db, IBGE, { client, now });
    expect(calls).toHaveLength(1 + 13);
    expect(r.crossCheckMatches).toBe(true);
    expect(r.pncp).toHaveLength(2);
  });

  it('falha do PNCP marca a conferência como incompleta (não prova nada)', async () => {
    const { fn } = fakeFetch(() => json({ erro: 'x' }, 500));
    const { client } = testClient(fn);
    const r = await verifyMunicipality(fakeDb().db, IBGE, { client, now, crossCheck: false });
    expect(r.incomplete).toBe(true);
  });
});
