import { fakeFetch, fixture, json } from './helpers.test-util';

/** Serve `total` contratações reais da fixture em páginas de 50, com identificadores únicos por `tag`. */
export function servePaged(total: number, tag = 'A', ibge?: string) {
  const rec = fixture('publicacao-pregao-eletronico.json').data as any[];
  return fakeFetch((url) => {
    if (total === 0) return new Response(null, { status: 204 });
    const pagina = Number(url.searchParams.get('pagina') ?? 1);
    const from = (pagina - 1) * 50;
    const n = Math.max(0, Math.min(50, total - from));
    const data = Array.from({ length: n }, (_, i) => {
      const r = structuredClone(rec[(from + i) % rec.length]);
      r.numeroControlePNCP = `${tag}${String(from + i).padStart(10, '0')}-1-000001/2026`;
      if (ibge) r.unidadeOrgao = { ...(r.unidadeOrgao ?? {}), codigoIbge: ibge };
      return r;
    });
    return json({
      data,
      totalRegistros: total,
      totalPaginas: Math.ceil(total / 50),
      numeroPagina: pagina,
      paginasRestantes: 0,
      empty: false,
    });
  });
}
