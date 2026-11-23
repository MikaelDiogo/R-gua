import {
  type PricingBenchmarkResponse,
  type PricingSimulationRequest,
  type PricingSimulationResponse,
} from '@agora/contracts';
import type { Db } from '@agora/db';
import { confidenceOf, robustStats, simulatePrice } from '@agora/domain';
import { Injectable } from '@nestjs/common';
import { CollectService } from '../documents/collect.service';
import { type Clock, InjectClock, InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';
import { fold } from '../search/highlight';

const STOP = new Set([
  'para',
  'com',
  'sem',
  'dos',
  'das',
  'uma',
  'tipo',
  'unidade',
  'item',
  'material',
  'servico',
  'servicos',
  'conforme',
  'especificacao',
  'especificacoes',
]);

/** Até 4 termos mais distintivos da descrição (os mais longos), unidos por AND: mesma coisa descrita parecido. */
export function itemQuery(description: string): string | null {
  const words = [
    ...new Set(
      fold(description)
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !STOP.has(w)),
    ),
  ];
  const top = words.sort((a, b) => b.length - a.length).slice(0, 4);
  return top.length >= 2 ? top.join(' & ') : null;
}

const normUnit = (u: string | null) =>
  (u ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');

@Injectable()
export class PricingService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
    private readonly collect: CollectService,
  ) {}

  /**
   * Benchmark por item sobre itens de OUTRAS contratações já coletadas (a base é parcial, e o resultado diz isso).
   * Mesma unidade de medida, valores positivos, outliers fora de 1,5 × IQR. Nunca finge precisão (docs/09 §8).
   */
  async benchmark(procurementId: string): Promise<PricingBenchmarkResponse> {
    await this.collect.collect(procurementId);
    const items = (await this.collect.items(procurementId)).list;
    const baseRes = await this.db.query<{ n: string }>(
      'SELECT count(*) AS n FROM procurement_items WHERE procurement_id <> $1 AND unit_value > 0',
      [procurementId],
    );
    const out: PricingBenchmarkResponse['items'] = [];
    for (const it of items.slice(0, 60)) {
      const q = itemQuery(it.description);
      const notes: string[] = [];
      let values: number[] = [];
      if (!q) {
        notes.push('A descrição é curta demais para buscar itens parecidos.');
      } else {
        const r = await this.db.query<{ unit_value: string; unit: string | null }>(
          `SELECT unit_value, unit FROM procurement_items
           WHERE procurement_id <> $1 AND unit_value > 0 AND tsv @@ to_tsquery('portuguese', immutable_unaccent($2)) LIMIT 400`,
          [procurementId, q],
        );
        const sameUnit = r.rows.filter(
          (x) => !it.unit || !x.unit || normUnit(x.unit) === normUnit(it.unit),
        );
        if (sameUnit.length < r.rows.length)
          notes.push(
            `${r.rows.length - sameUnit.length} item(ns) parecido(s) ficaram de fora por ter outra unidade de medida.`,
          );
        values = sameUnit.map((x) => Number(x.unit_value));
      }
      const stats = robustStats(values);
      const confidence = confidenceOf(stats);
      if (confidence === 'none') notes.push('Ainda não há itens parecidos na base para comparar.');
      else if (confidence === 'low')
        notes.push('Amostra pequena ou muito dispersa: use só como referência.');
      if (stats.outliers_removed > 0)
        notes.push(`${stats.outliers_removed} valor(es) muito fora da curva foram descartados.`);
      out.push({
        item_number: it.number,
        description: it.description,
        quantity: it.quantity,
        unit: it.unit,
        edital_unit_value: it.unit_value,
        comparables: stats,
        confidence,
        notes,
      });
    }
    return {
      procurement_id: procurementId,
      items: out,
      collected_items: true,
      base_items: Number(baseRes.rows[0]?.n ?? 0),
      server_now: this.clock().toISOString(),
    };
  }

  simulate(req: PricingSimulationRequest): PricingSimulationResponse {
    if (req.taxes_pct + req.margin_pct >= 100) {
      throw new DomainError(
        'validation_failed',
        'Impostos e margem somam 100% ou mais: não há preço que entregue isso.',
      );
    }
    const s = simulatePrice({
      cost: req.cost,
      taxes_pct: req.taxes_pct,
      margin_pct: req.margin_pct,
      quantity: req.quantity,
    });
    return {
      ...s,
      within_reference:
        req.reference_unit_value === undefined ? null : s.target_price <= req.reference_unit_value,
      server_now: this.clock().toISOString(),
    };
  }
}
