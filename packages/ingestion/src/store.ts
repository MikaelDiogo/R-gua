import type { Db } from '@agora/db';
import type { NormalizedProcurement, RawPage } from './types';

export interface UpsertStats {
  inserted: number;
  updated: number;
  unchanged: number;
}

/** Texto da busca lexical (docs/06 §4): objeto + órgão + local + números do processo. */
export function lexicalText(p: NormalizedProcurement): string {
  return [
    p.objectText,
    p.organ.name,
    p.organ.unitName,
    p.organ.municipalityName,
    p.organ.uf,
    p.modalityName,
    p.processNumber,
    p.editalNumber ? `${p.editalNumber}/${p.year}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Upsert idempotente por `numero_controle_pncp` (docs/05 §7). Se o hash de conteúdo não mudou, não reescreve nada;
 * mudança relevante (prazo, situação, valor) gera linha em `procurement_changes`.
 */
export async function upsertProcurements(
  db: Db,
  items: NormalizedProcurement[],
): Promise<UpsertStats> {
  const stats: UpsertStats = { inserted: 0, updated: 0, unchanged: 0 };
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    for (const p of items) {
      await client.query(
        `INSERT INTO organs (cnpj, name, sphere, power, uf, municipality_ibge)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (cnpj) DO UPDATE SET name = EXCLUDED.name, sphere = EXCLUDED.sphere, power = EXCLUDED.power,
           uf = COALESCE(EXCLUDED.uf, organs.uf), municipality_ibge = COALESCE(EXCLUDED.municipality_ibge, organs.municipality_ibge)`,
        [
          p.organ.cnpj,
          p.organ.name,
          p.organ.sphere,
          p.organ.power,
          p.organ.uf,
          p.organ.municipalityIbge,
        ],
      );

      const prev = await client.query<{
        id: string;
        content_hash: string;
        proposals_close_at: Date | null;
        status: string;
        estimated_value: string | null;
      }>(
        'SELECT id, content_hash, proposals_close_at, status, estimated_value FROM procurements WHERE numero_controle_pncp = $1',
        [p.numeroControlePncp],
      );
      const before = prev.rows[0];
      if (before && before.content_hash === p.contentHash) {
        stats.unchanged++;
        continue;
      }

      const res = await client.query<{ id: string }>(
        `INSERT INTO procurements (numero_controle_pncp, organ_cnpj, process_number, edital_number, year, sequence,
           modality, modality_name, status, status_raw, object_text, object_raw, estimated_value, uf, municipality_ibge,
           municipality_name, unit_name, published_at, proposals_open_at, proposals_close_at, pncp_updated_at, srp,
           is_open, quality_flags, content_hash, source_url, origin_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27)
         ON CONFLICT (numero_controle_pncp) DO UPDATE SET
           process_number = EXCLUDED.process_number, edital_number = EXCLUDED.edital_number, modality = EXCLUDED.modality,
           modality_name = EXCLUDED.modality_name, status = EXCLUDED.status, status_raw = EXCLUDED.status_raw,
           object_text = EXCLUDED.object_text, object_raw = EXCLUDED.object_raw, estimated_value = EXCLUDED.estimated_value,
           uf = EXCLUDED.uf, municipality_ibge = EXCLUDED.municipality_ibge, municipality_name = EXCLUDED.municipality_name,
           unit_name = EXCLUDED.unit_name, published_at = EXCLUDED.published_at, proposals_open_at = EXCLUDED.proposals_open_at,
           proposals_close_at = EXCLUDED.proposals_close_at, pncp_updated_at = EXCLUDED.pncp_updated_at, srp = EXCLUDED.srp,
           is_open = EXCLUDED.is_open, quality_flags = EXCLUDED.quality_flags, content_hash = EXCLUDED.content_hash,
           source_url = EXCLUDED.source_url, origin_url = EXCLUDED.origin_url, updated_at = now()
         RETURNING id`,
        [
          p.numeroControlePncp,
          p.organ.cnpj,
          p.processNumber,
          p.editalNumber,
          p.year,
          p.sequence,
          p.modality,
          p.modalityName,
          p.status,
          p.statusRaw,
          p.objectText,
          p.objectRaw,
          p.estimatedValue,
          p.organ.uf,
          p.organ.municipalityIbge,
          p.organ.municipalityName,
          p.organ.unitName,
          p.publishedAt,
          p.proposalsOpenAt,
          p.proposalsCloseAt,
          p.pncpUpdatedAt,
          p.srp,
          p.isOpen,
          p.qualityFlags,
          p.contentHash,
          p.sourceUrl,
          p.originSystemUrl,
        ],
      );
      const id = res.rows[0]?.id as string;

      if (before) {
        stats.updated++;
        const fields: string[] = [];
        if (before.status !== p.status) fields.push('status');
        if ((before.proposals_close_at?.toISOString() ?? null) !== p.proposalsCloseAt)
          fields.push('proposals_close_at');
        if (
          (before.estimated_value === null ? null : Number(before.estimated_value)) !==
          p.estimatedValue
        )
          fields.push('estimated_value');
        if (fields.length > 0) {
          await client.query(
            'INSERT INTO procurement_changes (procurement_id, fields, before, after) VALUES ($1,$2,$3,$4)',
            [
              id,
              fields,
              JSON.stringify({
                status: before.status,
                proposals_close_at: before.proposals_close_at,
                estimated_value: before.estimated_value,
              }),
              JSON.stringify({
                status: p.status,
                proposals_close_at: p.proposalsCloseAt,
                estimated_value: p.estimatedValue,
              }),
            ],
          );
        }
      } else {
        stats.inserted++;
      }

      await client.query(
        `INSERT INTO procurement_search (procurement_id, lexical_text) VALUES ($1,$2)
         ON CONFLICT (procurement_id) DO UPDATE SET lexical_text = EXCLUDED.lexical_text, updated_at = now()`,
        [id, lexicalText(p)],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
  return stats;
}

/** Guarda a página bruta para reprocessar sem chamar o PNCP de novo (docs/05 §4). */
export async function saveRaw(db: Db, source: string, pages: RawPage[]): Promise<void> {
  for (const r of pages) {
    await db.query(
      'INSERT INTO ingest_raw (source, endpoint, params, fetched_at, http_status, status, body) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [
        source,
        r.endpoint,
        JSON.stringify(r.params),
        r.fetchedAt,
        r.httpStatus,
        r.status,
        r.body === null ? null : JSON.stringify(r.body),
      ],
    );
  }
}

/** Modalidade 0 = "todas" (janela sem filtro de modalidade). NULL não serve: NULL nunca conflita na UNIQUE e duplicaria a linha. */
const modalityKey = (m: number | undefined) => m ?? 0;

export interface WindowKey {
  source: string;
  endpoint: string;
  modality?: number | undefined;
  start: string;
  end: string;
}

export async function recordWindow(
  db: Db,
  w: WindowKey,
  state: 'running' | 'ok' | 'partial' | 'failed',
  records: number,
  error?: string,
): Promise<void> {
  await db.query(
    `INSERT INTO ingest_window (source, endpoint, modality, window_start, window_end, state, attempts, records, last_error)
     VALUES ($1,$2,$3,$4,$5,$6,1,$7,$8)
     ON CONFLICT (source, endpoint, modality, window_start, window_end)
     DO UPDATE SET state = EXCLUDED.state, attempts = ingest_window.attempts + 1, records = EXCLUDED.records,
       last_error = EXCLUDED.last_error, updated_at = now()`,
    [w.source, w.endpoint, modalityKey(w.modality), w.start, w.end, state, records, error ?? null],
  );
}

/** Estado e idade (em horas) do último registro da janela, para retomar uma carga sem refazer o que já está ok. */
export async function windowState(
  db: Db,
  w: WindowKey,
): Promise<{ state: string; ageHours: number } | null> {
  const r = await db.query<{ state: string; age_hours: string }>(
    `SELECT state, EXTRACT(EPOCH FROM (now() - updated_at)) / 3600 AS age_hours FROM ingest_window
     WHERE source = $1 AND endpoint = $2 AND modality = $3 AND window_start = $4 AND window_end = $5`,
    [w.source, w.endpoint, modalityKey(w.modality), w.start, w.end],
  );
  const row = r.rows[0];
  return row ? { state: row.state, ageHours: Number(row.age_hours) } : null;
}

/** Fecha os vencidos (docs/07 §3) e reconstrói o vocabulário de sugestões e correção ortográfica. */
export async function maintenance(db: Db): Promise<{ closed: number; vocab: number }> {
  const closed = await db.query(
    'UPDATE procurements SET is_open = false WHERE is_open AND proposals_close_at <= now()',
  );
  // O status acompanha o prazo (o mesmo resultado de buscar de novo no PNCP): aberta vencida vira encerrada.
  await db.query(
    "UPDATE procurements SET status = 'closed' WHERE status = 'open_for_proposals' AND proposals_close_at <= now()",
  );
  await db.query('DELETE FROM search_vocab');
  const vocab = await db.query(
    `INSERT INTO search_vocab (term, freq)
     SELECT w, count(*) FROM (
       SELECT regexp_split_to_table(lower(immutable_unaccent(object_text)), '[^a-z0-9]+') AS w FROM procurements
     ) t WHERE length(w) >= 4 AND w !~ '^[0-9]+$' GROUP BY w HAVING count(*) >= 3 ORDER BY count(*) DESC LIMIT 30000`,
  );
  return { closed: closed.rowCount ?? 0, vocab: vocab.rowCount ?? 0 };
}
