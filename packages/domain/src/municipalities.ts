import { MUNICIPALITIES, type Municipality, type MunicipalityUf } from './municipalities-data';

export { MUNICIPALITIES, type Municipality, type MunicipalityUf };

/** Minúsculas e sem acento, caractere a caractere: o comprimento não muda, então os índices servem ao texto original. */
export function foldChars(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s.charAt(i);
    out += (ch.normalize('NFD')[0] ?? ch).toLowerCase();
  }
  return out;
}

/**
 * Nomes que também são palavra comum (barro, aurora, cruz…) ou muito curtos (ico, ipu, jati): só valem como
 * lugar quando escritos com inicial maiúscula ou quando são tudo o que o usuário disse.
 */
const COMMON_WORD_NAMES = new Set([
  'barro',
  'aurora',
  'cedro',
  'granja',
  'palmeira',
  'milagres',
  'salitre',
  'redencao',
  'independencia',
  'cruz',
  'caridade',
  'cocal',
  'uniao',
  'regeneracao',
  'iracema',
  'madalena',
  'paraiso',
  'jardim',
  'campos sales',
  'alegrete do piaui',
]);

interface NameEntry {
  folded: string;
  list: Municipality[];
}

const BY_NAME: NameEntry[] = (() => {
  const map = new Map<string, Municipality[]>();
  for (const m of MUNICIPALITIES) {
    const key = foldChars(m.name);
    map.set(key, [...(map.get(key) ?? []), m]);
  }
  // Nome mais longo primeiro: "Santa Quitéria" ganha de "Santa", "Pedro II" de "Pedro".
  return [...map.entries()]
    .map(([folded, list]) => ({ folded, list }))
    .sort((a, b) => b.folded.length - a.folded.length || a.folded.localeCompare(b.folded));
})();

const isWordChar = (ch: string) => /[a-z0-9]/.test(ch);

/** Posições (início, fim) de `needle` como palavra inteira em `hay` (ambos já sem acento e em minúsculas). */
function wordOccurrences(hay: string, needle: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) break;
    const end = i + needle.length;
    const before = i === 0 ? '' : hay.charAt(i - 1);
    const after = end >= hay.length ? '' : hay.charAt(end);
    if (!isWordChar(before) && !isWordChar(after)) out.push([i, end]);
    from = i + 1;
  }
  return out;
}

export interface PlaceMatch {
  /** Trecho exato do texto original. */
  text: string;
  start: number;
  end: number;
  /** Mais de um quando o nome existe nos dois estados. */
  municipalities: Municipality[];
}

/** Palavras que não dizem o que o usuário quer comprar: pedido, verbo, "licitação", lugar genérico. */
const NOISE = new Set(
  (
    'licitacao licitacoes edital editais pregao pregoes concorrencia concorrencias dispensa dispensas ' +
    'inexigibilidade credenciamento contratacao contratacoes processo processos certame certames compra compras ' +
    'aberta abertas aberto abertos vigor andamento disponivel disponiveis vigente vigentes ativa ativas ativo ativos ' +
    'todas todos todo toda tudo quais qual quero quer preciso precisa busca buscar busque procure procurar procurando ' +
    'mostre mostrar traga trazer listar lista liste ver veja existe existem tem ha haver pncp publica publicas publico ' +
    'publicos prefeitura municipio cidade municipal ceara piaui cearense piauiense estado ' +
    'de do da dos das no na nos nas em para pra por com a o as os e ou um uma uns umas que sobre me minha meu nosso ' +
    'ate ainda agora hoje recente recentes nova novas novo novos ultima ultimas ultimo ultimos tipo alguma algum ' +
    'alguns algumas mais menos favor ola oi bom dia tarde noite'
  ).split(/\s+/),
);

export const isNoiseWord = (word: string) => NOISE.has(foldChars(word).replace(/[^a-z0-9]/g, ''));

/** Palavras com conteúdo: o que sobra do texto sem ruído, na ordem e na grafia originais. */
export function contentWords(text: string): string[] {
  return text
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0 && !isNoiseWord(w) && !/^\d{1,2}$/.test(w));
}

/**
 * Remove o ruído do texto ("licitações em", "quero ver"…). Devolve o que sobrou; vazio quando o pedido era só
 * "licitações em Crateús": então a consulta não exige nenhuma palavra no objeto do edital.
 */
export function stripSearchNoise(text: string): string {
  return contentWords(text).join(' ');
}

/**
 * Municípios de CE e PI citados no texto. Casa palavra inteira, sem acento, o nome mais longo primeiro, sem
 * sobreposição. Nome distintivo (Crateús, Sobral) vale em qualquer lugar do texto; nome que também é palavra comum
 * (Barro, Cruz, Aurora) só vale com inicial maiúscula ou sozinho, para "tijolo de barro" não virar a cidade.
 * Vários lugares ("Crateús e Sobral") voltam todos: o filtro é "um OU outro", nunca "o mais parecido".
 */
export function findMunicipalities(text: string): PlaceMatch[] {
  const folded = foldChars(text);
  const taken: Array<[number, number]> = [];
  const found: PlaceMatch[] = [];
  const onlyName = (name: string) =>
    stripSearchNoise(text).length === 0 || foldChars(stripSearchNoise(text)) === name;
  for (const { folded: name, list } of BY_NAME) {
    for (const [start, end] of wordOccurrences(folded, name)) {
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      const original = text.slice(start, end);
      const common = COMMON_WORD_NAMES.has(name) || name.length <= 4;
      const capitalized = /^\p{Lu}/u.test(original);
      if (common && !capitalized && !onlyName(name)) continue;
      taken.push([start, end]);
      found.push({ text: original, start, end, municipalities: list });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

/** Capitais e cidades grandes fora de CE/PI, e os outros estados: o Régua só cobre Ceará e Piauí. */
const OUTSIDE = [
  'Rio Branco',
  'Maceió',
  'Macapá',
  'Manaus',
  'Salvador',
  'Vitória',
  'Goiânia',
  'São Luís',
  'Cuiabá',
  'Campo Grande',
  'Belo Horizonte',
  'Belém',
  'João Pessoa',
  'Curitiba',
  'Recife',
  'Rio de Janeiro',
  'Natal',
  'Porto Alegre',
  'Porto Velho',
  'Boa Vista',
  'Florianópolis',
  'São Paulo',
  'Aracaju',
  'Palmas',
  'Brasília',
  'Guarulhos',
  'Campinas',
  'São Gonçalo',
  'Duque de Caxias',
  'Nova Iguaçu',
  'Osasco',
  'Santo André',
  'Uberlândia',
  'Contagem',
  'Sorocaba',
  'Ribeirão Preto',
  'Feira de Santana',
  'Joinville',
  'Londrina',
  'Juiz de Fora',
  'Niterói',
  'Caxias do Sul',
  'Petrolina',
  'Caruaru',
  'Olinda',
  'Jaboatão dos Guararapes',
  'Mossoró',
  'Campina Grande',
  'Imperatriz',
  'Santos',
  'São José dos Campos',
  'Acre',
  'Alagoas',
  'Amapá',
  'Amazonas',
  'Bahia',
  'Espírito Santo',
  'Goiás',
  'Maranhão',
  'Mato Grosso do Sul',
  'Mato Grosso',
  'Minas Gerais',
  'Pará',
  'Paraíba',
  'Paraná',
  'Pernambuco',
  'Rio Grande do Norte',
  'Rio Grande do Sul',
  'Rondônia',
  'Roraima',
  'Santa Catarina',
  'Sergipe',
  'Tocantins',
  'Distrito Federal',
];

const OUTSIDE_FOLDED = OUTSIDE.map((n) => ({ name: n, folded: foldChars(n) })).sort(
  (a, b) => b.folded.length - a.folded.length,
);

/**
 * Lugares fora de CE/PI citados no pedido (para dizer com clareza que a cobertura é só CE e PI). Exige inicial
 * maiúscula: "para" (preposição) não vira o estado do Pará. Lugar que também é município de CE/PI não conta.
 */
export function findOutsidePlaces(
  text: string,
  inside: PlaceMatch[] = findMunicipalities(text),
): string[] {
  const folded = foldChars(text);
  const taken = inside.map((m): [number, number] => [m.start, m.end]);
  const out: string[] = [];
  for (const { name, folded: f } of OUTSIDE_FOLDED) {
    for (const [start, end] of wordOccurrences(folded, f)) {
      if (!/^\p{Lu}/u.test(text.slice(start, end))) continue;
      if (taken.some(([s, e]) => start < e && end > s)) continue;
      taken.push([start, end]);
      if (!out.includes(name)) out.push(name);
    }
  }
  return out;
}

export interface PlaceExtraction {
  /** Municípios de CE/PI achados (todos que o pedido citou). */
  municipalities: Municipality[];
  matches: PlaceMatch[];
  /** Lugares fora de CE/PI citados (ex.: "São Paulo"). */
  outside: string[];
  /** O pedido sem o nome do lugar e sem ruído; vazio = o usuário só pediu "as licitações de <lugar>". */
  rest: string;
}

/** Lê o lugar do pedido de forma determinística (sem IA) e devolve o que sobra para buscar no objeto do edital. */
export function extractPlace(text: string): PlaceExtraction {
  const matches = findMunicipalities(text);
  let rest = text;
  for (const m of [...matches].sort((a, b) => b.start - a.start)) {
    rest = `${rest.slice(0, m.start)} ${rest.slice(m.end)}`;
  }
  const outside = findOutsidePlaces(text, matches);
  for (const o of outside) {
    const i = foldChars(rest).indexOf(foldChars(o));
    if (i >= 0) rest = `${rest.slice(0, i)} ${rest.slice(i + o.length)}`;
  }
  const seen = new Set<string>();
  const municipalities: Municipality[] = [];
  for (const m of matches)
    for (const x of m.municipalities)
      if (!seen.has(x.ibge)) {
        seen.add(x.ibge);
        municipalities.push(x);
      }
  return { municipalities, matches, outside, rest: stripSearchNoise(rest) };
}

/** Autocomplete: nomes que começam com (ou contêm) o texto, sem acento; os que começam vêm primeiro. */
export function searchMunicipalities(q: string, limit = 10): Municipality[] {
  const needle = foldChars(q).trim();
  if (needle.length === 0) return MUNICIPALITIES.slice(0, limit);
  const starts: Municipality[] = [];
  const contains: Municipality[] = [];
  for (const m of MUNICIPALITIES) {
    const f = foldChars(m.name);
    if (f.startsWith(needle)) starts.push(m);
    else if (f.includes(needle)) contains.push(m);
  }
  return [...starts, ...contains].slice(0, limit);
}
