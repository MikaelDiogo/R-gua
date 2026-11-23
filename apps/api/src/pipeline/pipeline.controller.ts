import { CreateCardCommand, MoveCardCommand, UpdateCardCommand } from '@agora/contracts';
import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { UserId } from '../auth/auth.guard';
import { PipelineService } from './pipeline.service';

@Controller('v1/pipeline')
export class PipelineController {
  constructor(private readonly pipeline: PipelineService) {}

  @Get()
  list(@UserId() userId: string) {
    return this.pipeline.list(userId);
  }

  @Post('cards')
  @HttpCode(201)
  create(
    @UserId() userId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.pipeline.create(userId, CreateCardCommand.parse(body), key);
  }

  @Post('cards/:id/commands/move')
  @HttpCode(200)
  move(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.pipeline.move(userId, id, MoveCardCommand.parse(body), ifMatch, key);
  }

  @Patch('cards/:id')
  update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.pipeline.update(userId, id, UpdateCardCommand.parse(body), ifMatch);
  }
}
