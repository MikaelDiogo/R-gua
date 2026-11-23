import { GenerateProposalRequest, PricingSimulationRequest } from '@agora/contracts';
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
  Put,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { checkAiQuota } from '../ai/rate-limit';
import { UserId } from '../auth/auth.guard';
import { DomainError } from '../platform/problem.filter';
import { PricingService } from '../pricing/pricing.service';
import { proposalToDocx } from './docx';
import { ProposalsService } from './proposals.service';

@Controller('v1')
export class ProposalsController {
  constructor(
    private readonly proposals: ProposalsService,
    private readonly pricing: PricingService,
  ) {}

  @Post('ai/proposals')
  @HttpCode(200)
  generate(@UserId() userId: string, @Body() body: unknown) {
    const req = GenerateProposalRequest.parse(body ?? {});
    checkAiQuota();
    return this.proposals.generate(userId, req);
  }

  @Get('proposals')
  list(@UserId() userId: string) {
    return this.proposals.list(userId);
  }

  @Get('proposals/:id')
  get(@UserId() userId: string, @Param('id') id: string) {
    return this.proposals.get(userId, id);
  }

  @Patch('proposals/:id')
  update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.proposals.update(userId, id, body, ifMatch);
  }

  @Get('proposals/:id/export.docx')
  @Header('content-type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
  @Header('cache-control', 'no-store')
  async exportDocx(@UserId() userId: string, @Param('id') id: string) {
    const p = await this.proposals.get(userId, id);
    const buf = await proposalToDocx(p);
    return new StreamableFile(buf, {
      disposition: `attachment; filename="proposta-${id.slice(0, 8)}.docx"`,
    });
  }

  @Get('pricing/benchmark')
  benchmark(@Query('procurement_id') id?: string) {
    if (!id || !/^[0-9a-f-]{36}$/i.test(id))
      throw new DomainError('validation_failed', 'procurement_id é obrigatório');
    return this.pricing.benchmark(id);
  }

  @Post('pricing/simulations')
  @HttpCode(200)
  simulate(@Body() body: unknown) {
    return this.pricing.simulate(PricingSimulationRequest.parse(body ?? {}));
  }
}
