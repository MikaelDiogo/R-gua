// unpdf é ESM puro e o projeto resolve módulos no modo antigo: declaramos só o que usamos.
declare module 'unpdf' {
  export function getDocumentProxy(data: Uint8Array): Promise<{ numPages: number }>;
  export function extractText(
    pdf: unknown,
    options: { mergePages: false },
  ): Promise<{ text: string[] }>;
}
