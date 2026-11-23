import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  StreamableFile,
} from '@nestjs/common';
import { checkAiQuota } from '../ai/rate-limit';
import { UserId } from '../auth/auth.guard';
import { LegalService } from './legal.service';
import { legalToDocx } from './legal-docx';

@Controller('v1')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  /** Gera o rascunho (30 a 100 s): pesquisa em sites oficiais, redação, conferência das fontes e prazo. */
  @Post('ai/legal-pieces')
  @HttpCode(200)
  generate(@UserId() userId: string, @Body() body: unknown) {
    checkAiQuota();
    return this.legal.generate(userId, body);
  }

  @Get('legal-pieces')
  list(@UserId() userId: string) {
    return this.legal.list(userId);
  }

  @Get('legal-pieces/:id')
  get(@UserId() userId: string, @Param('id') id: string) {
    return this.legal.get(userId, id);
  }

  @Patch('legal-pieces/:id')
  update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.legal.update(userId, id, body, ifMatch);
  }

  @Get('legal-pieces/:id/export.docx')
  @Header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  @Header('cache-control', 'no-store')
  async exportDocx(@UserId() userId: string, @Param('id') id: string) {
    const p = await this.legal.get(userId, id);
    return new StreamableFile(await legalToDocx(p), {
      disposition: `attachment; filename="peca-${id.slice(0, 8)}.docx"`,
    });
  }
}
