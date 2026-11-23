import { createPool } from '@agora/db';
import { PncpPublicApi } from '@agora/ingestion';

/**
 * Coleta em massa os itens das contratações abertas que ainda não os têm, para alimentar o benchmark do precificador.
 * Uso: node dist/items.js [--limit 300] [--rate 20]
 * Respeita o limite de chamadas; cada edital é uma transação; falha de um não derruba os demais e nunca vira "sem itens".
 */
function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? (process.argv[i + 1] as string) : fallback;
}

async function main() {
  const limit = Number(arg('limit', '300'));
  const rate = Number(arg('rate', '20'));
  const db = createPool('app');
  const api = new PncpPublicApi({ maxCallsPerMinute: rate });
  try {
    const todo = await db.query<{ id: string; organ_cnpj: string; year: number; sequence: number }>(
      `SELECT id, organ_cnpj, year, sequence FROM procurements
       WHERE items_collected_at IS NULL AND status = 'open_for_proposals' AND proposals_close_at > now()
       ORDER BY estimated_value DESC NULLS LAST LIMIT $1`,
      [limit],
    );
    let ok = 0;
    let failed = 0;
    let rows = 0;
    for (const p of todo.rows) {
      const r = await api.items(p.organ_cnpj, p.year, p.sequence);
      if (!r.ok) {
        failed++;
        console.log(`falha ${p.organ_cnpj}/${p.year}/${p.sequence}: ${r.error}`);
        if (r.error === 'rate_limited') await new Promise((res) => setTimeout(res, 30_000));
        continue;
      }
      const c = await db.connect();
      try {
        await c.query('BEGIN');
        for (const it of r.data) {
          await c.query(
            `INSERT INTO procurement_items (procurement_id, item_number, description, quantity, unit, unit_value, total_value, kind, situation)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT (procurement_id, item_number) DO NOTHING`,
            [
              p.id,
              it.numeroItem,
              it.descricao,
              it.quantidade ?? null,
              it.unidadeMedida ?? null,
              it.valorUnitarioEstimado ?? null,
              it.valorTotal ?? null,
              it.materialOuServicoNome ?? null,
              it.situacaoCompraItemNome ?? null,
            ],
          );
        }
        await c.query('UPDATE procurements SET items_collected_at = now() WHERE id = $1', [p.id]);
        await c.query('COMMIT');
        ok++;
        rows += r.data.length;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => undefined);
        failed++;
        console.log('erro ao gravar:', e instanceof Error ? e.message : e);
      } finally {
        c.release();
      }
      if (ok % 25 === 0) console.log(`${ok}/${todo.rows.length} editais · ${rows} itens`);
    }
    console.log(
      `concluído: ${ok} editais com itens (${rows} itens), ${failed} falhas, de ${todo.rows.length}`,
    );
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
