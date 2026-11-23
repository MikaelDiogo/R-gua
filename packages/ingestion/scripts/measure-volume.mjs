// Fase 0 (docs/13): mede quantas contratações o PNCP publica por dia e modalidade, para projetar backfill e índice.
// Uso: node packages/ingestion/scripts/measure-volume.mjs [dias=14] [saida.json]
// Retomável: reaproveita células já medidas no arquivo de saída. Usa o teto padrão do cliente (rate limit conservador).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import {
  ALL_MODALITIES,
  EP_PROPOSTA,
  EP_PUBLICACAO,
  PncpClient,
  toPncpDate,
} from '../dist/index.js';

const days = Number(process.argv[2] ?? 14);
const out = process.argv[3] ?? 'docs/medicoes/pncp-volume.json';
const client = new PncpClient({ maxCallsPerMinute: 10 });
const state = existsSync(out)
  ? JSON.parse(readFileSync(out, 'utf8'))
  : { cells: {}, openProposals: null };
const save = () => writeFileSync(out, JSON.stringify(state, null, 1));

const today = new Date();
for (let d = 1; d <= days; d++) {
  const day = toPncpDate(new Date(today.getTime() - d * 86400000));
  for (const m of ALL_MODALITIES) {
    const key = `${day}:${m}`;
    if (state.cells[key]) continue;
    const r = await client.get(EP_PUBLICACAO, {
      dataInicial: day,
      dataFinal: day,
      codigoModalidadeContratacao: m,
      pagina: 1,
      tamanhoPagina: 10,
    });
    if (r.status === 'ok')
      state.cells[key] = {
        total: r.page.totalRegistros,
        pages50: Math.ceil(r.page.totalRegistros / 50),
      };
    else if (r.status === 'empty') state.cells[key] = { total: 0, pages50: 0 };
    else {
      console.log(`FALHA ${key}: ${r.status} ${r.error ?? ''}`);
      continue;
    } // nunca grava falha como zero
    save();
  }
  console.log(`dia ${day} ok`);
}
const r = await client.get(EP_PROPOSTA, {
  dataFinal: toPncpDate(new Date(today.getTime() + 365 * 86400000)),
  pagina: 1,
  tamanhoPagina: 10,
});
if (r.status === 'ok')
  state.openProposals = { total: r.page.totalRegistros, at: new Date().toISOString() };
state.measuredAt = new Date().toISOString();
save();
console.log('concluído');
