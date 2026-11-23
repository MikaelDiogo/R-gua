import type { ReactNode } from 'react';
import s from './chat.module.css';

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] };

const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const BULLET = /^\s*[-•*]\s+(.*)$/;

/** Texto simples do servidor → blocos (parágrafo, lista numerada, lista de itens). Nada de HTML do servidor. */
export function parseHelp(text: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ kind: 'p', text: para.join(' ') });
    para = [];
  };
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    const num = NUMBERED.exec(line);
    const bul = BULLET.exec(line);
    if (num || bul) {
      flush();
      const kind = num ? 'ol' : 'ul';
      const last = blocks[blocks.length - 1];
      const item = (num ?? bul)?.[1] ?? '';
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ kind, items: [item] });
    } else if (line.trim() === '') {
      flush();
    } else {
      // Continuação de um item da lista (linha recuada logo depois dele) ou de um parágrafo.
      const last = blocks[blocks.length - 1];
      if (para.length === 0 && last && last.kind !== 'p' && /^\s+\S/.test(raw)) {
        const i = last.items.length - 1;
        last.items[i] = `${last.items[i] ?? ''} ${line.trim()}`;
      } else {
        para.push(line.trim());
      }
    }
  }
  flush();
  return blocks;
}

/** **negrito** simples; o resto vira texto puro (o React escapa tudo). */
function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        // biome-ignore lint/suspicious/noArrayIndexKey: partes estáticas do mesmo texto
        <strong key={i}>{part.slice(2, -2)}</strong>
      ) : (
        part
      ),
    );
}

/**
 * Resposta de AJUDA do chat (`kind = 'help'`): o chat explicou algo sobre o Régua. Sem cartões, sem filtros e sem
 * selos de fonte. As perguntas de continuação viram chips que, ao clicar, enviam a pergunta.
 */
export function HelpAnswer({
  answer,
  suggestions,
  onAsk,
  disabled,
}: {
  answer: string;
  suggestions: string[];
  onAsk: (q: string) => void;
  disabled?: boolean;
}) {
  const blocks = parseHelp(answer);
  return (
    <div className={`rg-msg-ai ${s.help}`}>
      {blocks.map((b, i) => {
        const key = i;
        if (b.kind === 'p') return <p key={key}>{inline(b.text)}</p>;
        const Tag = b.kind === 'ol' ? 'ol' : 'ul';
        return (
          <Tag key={key} className={s.helpList}>
            {b.items.map((it, j) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: itens estáticos
              <li key={j}>{inline(it)}</li>
            ))}
          </Tag>
        );
      })}
      {suggestions.length > 0 ? (
        <div className="rg-suggests">
          {suggestions.map((q) => (
            <button
              type="button"
              className="rg-suggest"
              key={q}
              disabled={disabled}
              onClick={() => onAsk(q)}
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
