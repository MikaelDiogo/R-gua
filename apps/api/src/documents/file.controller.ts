import { Controller, Get, Param, Req, Res, StreamableFile } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError } from '../platform/problem.filter';
import { DocumentFileService } from './file.service';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Página de erro para quem clicou em "Ler PDF" (o navegador abre uma aba nova: JSON cru não ajuda ninguém). */
function errorPage(message: string, pncpUrl: string | undefined): string {
  const direct =
    pncpUrl && /^https:\/\/([a-z0-9-]+\.)?pncp\.gov\.br\//i.test(pncpUrl)
      ? `<a class="b2" href="${esc(pncpUrl)}" rel="noopener noreferrer">Abrir direto no PNCP</a>`
      : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Não foi possível abrir o PDF · Régua</title><style>body{margin:0;background:#faf8f3;color:#1b1a17;font:15px/1.5 system-ui,sans-serif}main{max-width:480px;margin:14vh auto;padding:24px}h1{font:500 24px Georgia,serif;margin:0 0 12px}p{color:#3a3833;margin:0 0 20px}a{display:inline-block;height:36px;line-height:36px;padding:0 16px;border-radius:8px;text-decoration:none;font-weight:500;margin-right:8px}.b1{background:#1e6b5a;color:#fff}.b2{border:1px solid #8a857a;color:#1b1a17}</style></head><body><main><h1>Não foi possível abrir o PDF agora</h1><p>${esc(message)}</p><a class="b1" href="">Tentar de novo</a>${direct}</main></body></html>`;
}

@Controller('v1')
export class DocumentFileController {
  constructor(private readonly files: DocumentFileService) {}

  /** Abre o PDF do edital no visualizador do navegador. Exige sessão (guarda global). */
  @Get('procurements/:id/documents/:sequence/file')
  async file(
    @Param('id') id: string,
    @Param('sequence') sequence: string,
    @Req() req: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    try {
      const f = await this.files.pdf(id, sequence);
      void reply
        .header('content-type', 'application/pdf')
        .header('cache-control', 'private, max-age=300')
        .header('x-content-type-options', 'nosniff')
        .header('content-security-policy', "frame-ancestors 'self'")
        .header('x-frame-options', 'SAMEORIGIN');
      return new StreamableFile(f.bytes, { disposition: `inline; filename="${f.filename}"` });
    } catch (e) {
      const fromBrowser = String(req.headers.accept ?? '').includes('text/html');
      if (fromBrowser && e instanceof DomainError && e.code !== 'unauthenticated') {
        const pncp = typeof e.meta?.pncp_url === 'string' ? e.meta.pncp_url : undefined;
        void reply
          .status(e.code === 'not_found' ? 404 : 503)
          .header('content-type', 'text/html; charset=utf-8')
          .header('cache-control', 'no-store')
          .header(
            'content-security-policy',
            "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
          )
          .header('x-frame-options', 'DENY');
        return errorPage(e.message, pncp);
      }
      throw e;
    }
  }
}
