import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/auth.guard';
import type { SessionUser } from '../auth/auth.service';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';

/** Contas de pessoas (sistema fechado, sem cadastro público). Só `admin`; toda mutação com Idempotency-Key. */
@Controller('v1/admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  list() {
    return this.admin.list();
  }

  @Post('users')
  @HttpCode(201)
  create(
    @CurrentUser() user: SessionUser,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    return this.admin.create(user, key, body);
  }

  @Post('users/:id/reset-password')
  @HttpCode(200)
  reset(
    @CurrentUser() user: SessionUser,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.admin.resetPassword(user, key, id, body);
  }

  @Delete('users/:id')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: SessionUser,
    @Headers('idempotency-key') key: string | undefined,
    @Param('id') id: string,
  ) {
    await this.admin.remove(user, key, id);
  }
}
