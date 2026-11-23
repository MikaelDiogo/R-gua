'use client';

import type { ProcurementSummary } from '@agora/contracts';
import Link from 'next/link';
import { type ReactNode, useState } from 'react';
import { fmtBRL, readable, readableName } from '@/lib/format';
import s from './search.module.css';
import { DeadlineRuler } from './ui';

type Match = NonNullable<ProcurementSummary['match']>;

const MATCH_LABEL: Record<Match, { text: string; accent: boolean; why: string }> = {
  lexical: {
    text: 'Por palavra',
    accent: false,
    why: 'Os termos da busca aparecem no texto do edital',
  },
  semantic: {
    text: 'Por sentido',
    accent: true,
    why: 'O assunto é próximo, mesmo sem as mesmas palavras',
  },
  both: {
    text: 'Palavra e sentido',
    accent: true,
    why: 'Os termos aparecem no texto e o assunto também é próximo',
  },
};

/** Avisos de qualidade do dado (`quality_flags` do servidor, docs/05 §6). Só os que o usuário precisa saber. */
export function QualityFlags({ flags }: { flags: string[] }) {
  return (
    <>
      {flags.includes('value_missing') || flags.includes('value_suspect') ? (
        <span
          className="rg-tag rg-tag-warning"
          title="O órgão não informou o valor estimado, ou ele parece incorreto"
        >
          Valor não confiável
        </span>
      ) : null}
      {flags.includes('date_suspect') || flags.includes('proposal_dates_inverted') ? (
        <span
          className="rg-tag rg-tag-warning"
          title="As datas do edital parecem incorretas. Confira no PNCP"
        >
          Datas suspeitas
        </span>
      ) : null}
    </>
  );
}

/** Situação fora do normal do edital, sempre com palavra (a cor só reforça). */
function StatusTags({ item }: { item: ProcurementSummary }) {
  return (
    <>
      {item.status === 'canceled' ? <span className="rg-tag rg-tag-error">Revogado</span> : null}
      {item.status === 'suspended' ? <span className="rg-tag rg-tag-warning">Suspenso</span> : null}
      {item.status === 'closed' ? <span className="rg-tag">Encerrado</span> : null}
    </>
  );
}

function Title({ item, className }: { item: ProcurementSummary; className?: string }) {
  return (
    <h3 className={[className, 'clamp3'].filter(Boolean).join(' ')}>
      <Link href={`/editais/${item.id}`} className={s.titleLink}>
        {item.highlight
          ? item.highlight.map((part, i) =>
              part.match ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: trechos estáticos do texto
                <mark key={i}>{part.text}</mark>
              ) : (
                part.text
              ),
            )
          : readable(item.object)}
      </Link>
    </h3>
  );
}

const placeOf = (item: ProcurementSummary) =>
  [item.organ.municipality, item.organ.uf].filter(Boolean).join(' · ');

function Value({ item }: { item: ProcurementSummary }): ReactNode {
  return item.estimated_value != null ? (
    fmtBRL(item.estimated_value)
  ) : (
    <span
      className={s.dash}
      role="img"
      aria-label="Valor não informado"
      title="Valor não informado"
    >
      —
    </span>
  );
}

/** Cartão de um edital: usado em alertas e monitores, onde a lista é curta. */
export function ResultCard({
  item,
  compact = false,
}: {
  item: ProcurementSummary;
  compact?: boolean;
}) {
  const m = item.match ? MATCH_LABEL[item.match] : null;
  const closed = item.status !== 'open_for_proposals';
  const place = placeOf(item);
  return (
    <article
      className={s.card}
      data-compact={compact || undefined}
      data-closed={closed || undefined}
    >
      <div>
        <Title item={item} className={s.cardTitle} />
        <p className={s.cardMeta}>
          {readableName(item.organ.name)}
          {place ? ` · ${place}` : ''} · {item.modality.name}
        </p>
        <div className={s.tags}>
          {m ? (
            <span className={`rg-tag${m.accent ? ' rg-tag-accent' : ''}`} title={m.why}>
              {m.text}
            </span>
          ) : null}
          <StatusTags item={item} />
          <QualityFlags flags={item.quality_flags} />
        </div>
      </div>
      <div className={s.cardSide}>
        <div className={s.cardValue}>
          <Value item={item} />
        </div>
        <DeadlineRuler deadline={item.deadline} mini />
      </div>
    </article>
  );
}

/**
 * Resultados da busca como tabela (design Régua): objeto e órgão, UF, modalidade, valor e régua de prazo.
 * Abaixo de 760px a tabela vira lista. A linha clicada fica em accent-soft; o título é o link para o edital.
 */
export function ResultTable({
  items,
  pending,
}: {
  items: ProcurementSummary[];
  pending?: boolean;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <div className={s.tableWrap} data-pending={pending || undefined}>
      <table className={s.table}>
        <caption className={s.srOnly}>Editais encontrados</caption>
        <thead>
          <tr>
            <th className={s.colObject}>Objeto e órgão</th>
            <th>UF</th>
            <th>Modalidade</th>
            <th className={s.right}>Valor estimado</th>
            <th className={s.colRuler}>Propostas até</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const m = item.match ? MATCH_LABEL[item.match] : null;
            const place = item.organ.municipality;
            return (
              <tr
                key={item.id}
                aria-selected={selected === item.id}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return;
                  setSelected((cur) => (cur === item.id ? null : item.id));
                }}
              >
                <td className={s.colObject}>
                  <Title item={item} className={s.title} />
                  <span className={s.sub}>
                    {readableName(item.organ.name)}
                    {place ? ` · ${place}` : ''}
                  </span>
                  <div className={s.tags}>
                    {m?.accent ? (
                      <span className="rg-tag rg-tag-accent" title={m.why}>
                        {m.text}
                      </span>
                    ) : null}
                    <StatusTags item={item} />
                    <QualityFlags flags={item.quality_flags} />
                  </div>
                </td>
                <td>
                  <span className={s.cellLabel}>UF</span>
                  {item.organ.uf ?? (
                    <span className={s.dash} role="img" aria-label="UF não informada">
                      —
                    </span>
                  )}
                </td>
                <td>
                  <span className={s.cellLabel}>Modalidade</span>
                  {item.modality.name}
                </td>
                <td className={s.right}>
                  <span className={s.cellLabel}>Valor</span>
                  <Value item={item} />
                </td>
                <td className={s.colRuler}>
                  <DeadlineRuler deadline={item.deadline} mini />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
