import { Controller, Get, Header, Param, StreamableFile } from '@nestjs/common';
import { DocumentFileService } from './file.service';

@Controller('v1')
export class DocumentFileController {
  constructor(private readonly files: DocumentFileService) {}

  /** Abre o PDF do edital no visualizador do navegador. Exige sessão (guarda global). */
  @Get('procurements/:id/documents/:sequence/file')
  @Header('content-type', 'application/pdf')
  @Header('cache-control', 'private, max-age=300')
  @Header('x-content-type-options', 'nosniff')
  @Header('content-security-policy', "frame-ancestors 'self'")
  @Header('x-frame-options', 'SAMEORIGIN')
  async file(@Param('id') id: string, @Param('sequence') sequence: string) {
    const f = await this.files.pdf(id, sequence);
    return new StreamableFile(f.bytes, { disposition: `inline; filename="${f.filename}"` });
  }
}
