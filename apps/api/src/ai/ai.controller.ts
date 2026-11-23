import { AiSearchRequest, AnalyzeRequest } from '@agora/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import { UserId } from '../auth/auth.guard';
import { ConversationsService } from '../conversations/conversations.service';
import { DomainError } from '../platform/problem.filter';
import { AiSearchService } from './ai-search.service';
import { AnalysisService } from './analysis.service';
import { checkAiQuota } from './rate-limit';

@Controller('v1/ai')
export class AiController {
  constructor(
    private readonly ai: AiSearchService,
    private readonly analysis: AnalysisService,
    private readonly conversations: ConversationsService,
  ) {}

  @Post('search')
  @HttpCode(200)
  async run(@UserId() userId: string, @Body() body: unknown, @Req() http: FastifyRequest) {
    const req = AiSearchRequest.parse(body ?? {});
    // Conversa de outro usuário (ou inexistente) é 404 ANTES de gastar a busca.
    if (req.conversation_id) await this.conversations.assertOwned(userId, req.conversation_id);
    checkAiQuota();
    const result = await this.ai.run(req);
    // Cancelado pelo cliente (conexão fechada) = nada é gravado; a resposta já não tem para quem ir.
    if (http.raw.socket?.destroyed) {
      return {
        ...result,
        conversation_id: req.conversation_id ?? '00000000-0000-0000-0000-000000000000',
      };
    }
    return this.conversations.saveExchange(userId, req, result);
  }

  /** Leitor de edital (docs/09 §3). Síncrono: leva de 20 a 90 s; o resultado fica em cache por hash do texto. */
  @Post('analyses')
  @HttpCode(200)
  analyze(@Body() body: unknown) {
    const req = AnalyzeRequest.parse(body ?? {});
    return this.analysis.analyze(req.procurement_id).then((r) => {
      return r;
    });
  }

  @Get('analyses/:procurementId')
  async cached(@Param('procurementId') id: string) {
    const r = await this.analysis.cached(id);
    if (!r) throw new DomainError('not_found', 'Ainda não há análise deste edital.');
    return r;
  }
}
