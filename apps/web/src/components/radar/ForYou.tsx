import type { RadarForYouItem, RadarForYouResponse, RadarInterest } from '@agora/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Dash, DeadlineRuler } from '@/components/ui';
import type { ApiResult } from '@/lib/api';
import { fmtBRL, readable, readableName } from '@/lib/format';
import s from './forYou.module.css';
import { RetryButton } from './RetryButton';

const VISIBLE = 6;
const MAX = 10;
const MAX_CHIPS = 6;

const verb = (source: RadarInterest['source']) => (source === 'chat' ? 'pesquisou' : 'vigia');

/** "Porque você pesquisou: A · B" ou "Porque você pesquisou: A · vigia: B" (até 2 motivos, na ordem do servidor). */
function becauseText(because: RadarInterest[]): string {
  const [a, b] = because;
  if (!a) return '';
  if (!b) return `Porque você ${verb(a.source)}: ${a.label}`;
  return a.source === b.source
    ? `Porque você ${verb(a.source)}: ${a.label} · ${b.label}`
    : `Porque você ${verb(a.source)}: ${a.label} · ${verb(b.source)}: ${b.label}`;
}

function Chips({ interests }: { interests: RadarInterest[] }) {
  if (interests.length === 0) return null;
  const shown = interests.slice(0, MAX_CHIPS);
  const rest = interests.length - shown.length;
  return (
    <ul className={s.chips} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {shown.map((i) => (
        <li key={`${i.source}:${i.label}`}>
          <span
            className="rg-tag"
            title={`${i.source === 'chat' ? 'Pesquisou' : 'Monitor'}: ${i.label}`}
          >
            <span className={s.chipText}>
              {i.source === 'chat' ? 'Pesquisou' : 'Monitor'}: {i.label}
            </span>
          </span>
        </li>
      ))}
      {rest > 0 ? (
        <li>
          <span className="rg-tag">+{rest}</span>
        </li>
      ) : null}
    </ul>
  );
}

function Row({ item }: { item: RadarForYouItem }) {
  const e = item.procurement;
  return (
    <li className="radarRow">
      <div>
        <Link href={`/editais/${e.id}`} className={`radarObj ${s.clamp2}`}>
          {readable(e.object)}
        </Link>
        <p className="radarMeta">
          {readableName(e.organ.name)}
          {e.organ.uf ? ` · ${e.organ.uf}` : ''}
        </p>
        <p className={s.because}>{becauseText(item.because)}</p>
      </div>
      <div className="radarSide">
        <span className="radarValue">
          {e.estimated_value != null ? (
            fmtBRL(e.estimated_value)
          ) : (
            <Dash why="Valor estimado não informado" />
          )}
        </span>
        <DeadlineRuler deadline={e.deadline} mini />
      </div>
    </li>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <section className="radarBlock" aria-labelledby="foryou-h">
      <div className="radarBlockHead">
        <h2 id="foryou-h">Para você</h2>
      </div>
      <p className={s.lead}>Editais abertos que combinam com o que você pesquisou e vigia.</p>
      {children}
    </section>
  );
}

/**
 * "Para você": editais abertos que combinam com o que a pessoa pesquisou no chat e vigia nos monitores.
 * Tudo calculado no servidor (docs/04). A seção falha sozinha: o resto do Radar nunca depende dela.
 * `promise` é iniciada na página, em paralelo com o painel, e esta seção só espera por ela dentro do Suspense.
 */
export async function ForYou({
  promise,
}: {
  promise: Promise<ApiResult<RadarForYouResponse> | null>;
}) {
  const r = await promise;

  if (!r?.ok) {
    return (
      <Shell>
        <div className="rg-banner" role="status">
          <div className="rg-banner-body">
            <p className="rg-banner-title">Não consegui montar suas sugestões agora.</p>
            <p>O resto do Radar continua valendo. Tente de novo em instantes.</p>
          </div>
          <RetryButton className={s.retry} />
        </div>
      </Shell>
    );
  }

  const { items, interests, empty } = r.data;

  if (empty === 'no_interests') {
    return (
      <Shell>
        <div className="rg-empty">
          <div className="rg-empty-head">
            <span>Para você</span>
            <span className="num">0</span>
          </div>
          <div className="rg-empty-body">
            <p className="rg-empty-title">Ainda não sei o que você procura</p>
            <p>Pesquise no chat ou crie um monitor e o Radar passa a sugerir editais para você.</p>
            <div className={s.actions}>
              <Link href="/chat" className="rg-btn">
                Ir para o chat
              </Link>
              <Link href="/monitores/novo" className="rg-btn">
                Criar monitor
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  // Sem itens também quando o servidor não explicou o motivo: mesma mensagem honesta de "nada combina agora".
  if (items.length === 0) {
    return (
      <Shell>
        <Chips interests={interests} />
        <div className="rg-empty">
          <div className="rg-empty-head">
            <span>Para você</span>
            <span className="num">0</span>
          </div>
          <div className="rg-empty-body">
            <p className="rg-empty-title">Nada novo para você agora</p>
            <p>
              Nenhum edital aberto combina com o que você pesquisou agora. Veja de novo mais tarde.
            </p>
            <div className={s.actions}>
              <Link href="/busca" className="linkBtn">
                Ver os editais no Buscador
              </Link>
            </div>
          </div>
        </div>
      </Shell>
    );
  }

  const list = items.slice(0, MAX);
  const first = list.slice(0, VISIBLE);
  const more = list.slice(VISIBLE);

  return (
    <Shell>
      <Chips interests={interests} />
      <ul className="radarList">
        {first.map((it) => (
          <Row key={it.procurement.id} item={it} />
        ))}
      </ul>
      {more.length > 0 ? (
        <details className={s.more}>
          <summary>
            <span className={s.whenClosed}>Ver mais ({more.length})</span>
            <span className={s.whenOpen}>Ver menos</span>
          </summary>
          <ul className={`radarList ${s.moreList}`}>
            {more.map((it) => (
              <Row key={it.procurement.id} item={it} />
            ))}
          </ul>
        </details>
      ) : null}
    </Shell>
  );
}
