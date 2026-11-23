import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AdminController } from './admin/admin.controller';
import { AdminService } from './admin/admin.service';
import { AiController } from './ai/ai.controller';
import { AiSearchService, GEMINI, TAVILY } from './ai/ai-search.service';
import { AnalysisService } from './ai/analysis.service';
import { GeminiGateway } from './ai/gemini';
import { HELP_LLM, HelpService } from './ai/help.service';
import { TavilySearch } from './ai/tavily';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { AuthService } from './auth/auth.service';
import { ConversationsController } from './conversations/conversations.controller';
import { ConversationsService } from './conversations/conversations.service';
import { DashboardController } from './dashboard/dashboard.controller';
import { CollectService } from './documents/collect.service';
import { DocumentFileController } from './documents/file.controller';
import { DocumentFileService } from './documents/file.service';
import { HealthController } from './health/health.controller';
import { InternalController } from './internal/internal.controller';
import { LegalController } from './legal/legal.controller';
import { LegalService } from './legal/legal.service';
import { MonitorsController } from './monitors/monitors.controller';
import { MonitorsService } from './monitors/monitors.service';
import { PipelineController } from './pipeline/pipeline.controller';
import { PipelineService } from './pipeline/pipeline.service';
import { DbModule } from './platform/db.module';
import { PricingService } from './pricing/pricing.service';
import { ProfileService } from './proposals/profile.service';
import { ProposalsController } from './proposals/proposals.controller';
import { ProposalsService } from './proposals/proposals.service';
import { RadarController } from './radar/radar.controller';
import { RadarService } from './radar/radar.service';
import { SearchController } from './search/search.controller';
import { SearchService } from './search/search.service';

@Module({
  imports: [DbModule],
  controllers: [
    RadarController,
    LegalController,
    MonitorsController,
    AuthController,
    AdminController,
    DocumentFileController,
    HealthController,
    InternalController,
    SearchController,
    DashboardController,
    PipelineController,
    AiController,
    ConversationsController,
    ProposalsController,
  ],
  providers: [
    RadarService,
    LegalService,
    ConversationsService,
    MonitorsService,
    AuthService,
    AdminService,
    { provide: APP_GUARD, useClass: AuthGuard },
    SearchService,
    PipelineService,
    AiSearchService,
    HelpService,
    { provide: HELP_LLM, useExisting: GEMINI },
    AnalysisService,
    CollectService,
    DocumentFileService,
    PricingService,
    ProfileService,
    ProposalsService,
    { provide: TAVILY, useFactory: () => new TavilySearch({ apiKey: process.env.TAVILY_API_KEY }) },
    {
      // Chave e modelo só do ambiente do servidor; nunca vão ao cliente (docs/16 §4).
      provide: GEMINI,
      useFactory: () =>
        new GeminiGateway({
          apiKey: process.env.GEMINI_API_KEY,
          model: process.env.GEMINI_MODEL,
          fallbackModel: process.env.GEMINI_FALLBACK_MODEL || undefined,
        }),
    },
  ],
})
export class AppModule {}
