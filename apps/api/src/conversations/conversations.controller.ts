import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Query } from '@nestjs/common';
import { UserId } from '../auth/auth.guard';
import { ConversationsService } from './conversations.service';

/** Tudo escopado pelo usuário da sessão e por RLS: conversa de outro usuário é "não encontrada" (404). */
@Controller('v1/conversations')
export class ConversationsController {
  constructor(private readonly conversations: ConversationsService) {}

  @Get()
  list(@UserId() userId: string, @Query() query: unknown) {
    return this.conversations.list(userId, query);
  }

  @Get(':id')
  detail(@UserId() userId: string, @Param('id') id: string) {
    return this.conversations.get(userId, id);
  }

  @Patch(':id')
  rename(@UserId() userId: string, @Param('id') id: string, @Body() body: unknown) {
    return this.conversations.rename(userId, id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param('id') id: string) {
    await this.conversations.remove(userId, id);
  }
}
