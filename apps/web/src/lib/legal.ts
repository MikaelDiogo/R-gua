import type { LegalKind } from '@agora/contracts';

export const KIND_LABEL: Record<LegalKind, string> = {
  impugnation: 'Impugnação ao edital',
  appeal: 'Recurso administrativo',
  counter_arguments: 'Contrarrazões',
};

export const KIND_HELP: Record<LegalKind, string> = {
  impugnation:
    'Você acha que o edital tem uma exigência ilegal ou restritiva e quer pedir a correção antes da sessão.',
  appeal:
    'Você quer contestar uma decisão da comissão ou do pregoeiro (habilitação, classificação, desclassificação).',
  counter_arguments:
    'Outro licitante recorreu e você quer defender a decisão que lhe foi favorável.',
};

export const KIND_EXAMPLE: Record<LegalKind, string> = {
  impugnation:
    'Ex.: o item 8.3 exige atestado com quantitativo de 100% do objeto, o que restringe a competição. Quero que a exigência caia para até 50%.',
  appeal:
    'Ex.: fui desclassificada porque o preço unitário do item 4 passou do valor de referência, mas o valor global ficou abaixo do estimado.',
  counter_arguments:
    'Ex.: a concorrente alega que nosso atestado técnico não comprova o objeto, mas ele cumpre o item 9.2 do edital.',
};

export const KINDS = Object.keys(KIND_LABEL) as LegalKind[];

export const isKind = (v: unknown): v is LegalKind =>
  typeof v === 'string' && (KINDS as string[]).includes(v);

export type Token =
  | { type: 'text'; text: string }
  | { type: 'source'; id: string }
  | { type: 'placeholder'; text: string };

const MARK = /\[(S\d+)\]|\[PREENCHER:[^\]]*\]/g;

/** Divide o texto em trechos, marcadores de fonte [S1] e pendências [PREENCHER: …]. */
export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(MARK)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ type: 'text', text: text.slice(last, at) });
    out.push(m[1] ? { type: 'source', id: m[1] } : { type: 'placeholder', text: m[0] });
    last = at + m[0].length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last) });
  return out;
}

export const countPlaceholders = (text: string) =>
  (text.match(/\[PREENCHER:[^\]]*\]/g) ?? []).length;
