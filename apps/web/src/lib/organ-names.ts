// Nomes de órgãos já vistos. A URL e o monitor guardam só o CNPJ; este cache (sessão do navegador) devolve o nome.
// Mesma chave e formato do cache da Busca (components/SearchFilters.tsx), então os dois se ajudam.
const KEY = 'agora:orgaos:nomes:v1';

export function readOrganNames(): Record<string, string> {
  try {
    return JSON.parse(window.sessionStorage.getItem(KEY) ?? '{}') as Record<string, string>;
  } catch {
    return {};
  }
}

export function rememberOrganNames(list: { cnpj: string; name: string }[]) {
  try {
    window.sessionStorage.setItem(
      KEY,
      JSON.stringify({
        ...readOrganNames(),
        ...Object.fromEntries(list.map((o) => [o.cnpj, o.name])),
      }),
    );
  } catch {
    /* sem armazenamento: o chip mostra o CNPJ */
  }
}
