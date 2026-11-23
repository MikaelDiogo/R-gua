import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PncpClient } from './client';

export function fixture(name: string): any {
  return JSON.parse(readFileSync(join(__dirname, '../../fixtures', name), 'utf8'));
}

type Responder = (url: URL, call: number) => Response | Promise<Response>;

export function fakeFetch(responder: Responder) {
  const calls: URL[] = [];
  const fn = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    calls.push(url);
    return responder(url, calls.length);
  }) as typeof fetch;
  return { fn, calls };
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

/** Cliente de teste: sem espera real; registra os `sleep` pedidos. */
export function testClient(
  fetchFn: typeof fetch,
  extra: ConstructorParameters<typeof PncpClient>[0] = {},
) {
  const sleeps: number[] = [];
  let t = 1_000_000;
  const client = new PncpClient({
    fetch: fetchFn,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    now: () => t,
    random: () => 0.5,
    ...extra,
  });
  return { client, sleeps, advance: (ms: number) => (t += ms) };
}
