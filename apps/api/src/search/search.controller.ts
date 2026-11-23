import { MunicipalitiesQuery, SearchIntent } from '@agora/contracts';
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CollectService } from '../documents/collect.service';
import { SearchService } from './search.service';

@Controller('v1')
export class SearchController {
  constructor(
    private readonly search: SearchService,
    private readonly collect: CollectService,
  ) {}

  /** POST por conter filtros estruturados, mas é seguro e idempotente: não exige Idempotency-Key (docs/08 §3.2). */
  @Post('search')
  @HttpCode(200)
  run(@Body() body: unknown) {
    return this.search.search(SearchIntent.parse(body ?? {}));
  }

  @Get('search/suggest')
  suggest(@Query('q') q = '') {
    return this.search.suggest(q);
  }

  /** Autocomplete dos municípios de CE e PI (o filtro "Município" do Buscador). */
  @Get('municipalities')
  municipalities(@Query() query: unknown) {
    const q = MunicipalitiesQuery.parse(query ?? {});
    return this.search.municipalities(q.q, q.limit);
  }

  @Get('organs')
  organs(@Query('q') q = '') {
    return this.search.organs(q);
  }

  @Get('procurements/:id')
  async detail(@Param('id') id: string) {
    return this.collect.withCollected(await this.search.detail(id));
  }

  /** Coleta itens e documentos no PNCP (idempotente) e devolve o edital completo. */
  @Post('procurements/:id/collect')
  @HttpCode(200)
  async collectNow(@Param('id') id: string) {
    await this.search.detail(id); // 404 antes de chamar o PNCP
    await this.collect.collect(id);
    return this.collect.withCollected(await this.search.detail(id));
  }
}
