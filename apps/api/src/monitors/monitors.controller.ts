import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { UserId } from '../auth/auth.guard';
import { MonitorsService } from './monitors.service';

const int = (v: string | undefined, d: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : d;
};

@Controller('v1')
export class MonitorsController {
  constructor(private readonly monitors: MonitorsService) {}

  @Get('monitors')
  list(@UserId() userId: string) {
    return this.monitors.list(userId);
  }

  @Post('monitors')
  @HttpCode(201)
  create(@UserId() userId: string, @Body() body: unknown) {
    return this.monitors.create(userId, body);
  }

  @Get('monitors/:id')
  detail(
    @UserId() userId: string,
    @Param('id') id: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.monitors.detail(userId, id, int(page, 1, 1, 100), int(limit, 20, 1, 50));
  }

  @Patch('monitors/:id')
  update(
    @UserId() userId: string,
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('if-match') ifMatch?: string,
  ) {
    return this.monitors.update(userId, id, body, ifMatch);
  }

  @Delete('monitors/:id')
  @HttpCode(204)
  async remove(@UserId() userId: string, @Param('id') id: string) {
    await this.monitors.remove(userId, id);
  }

  @Post('monitors/:id/run')
  @HttpCode(200)
  run(@UserId() userId: string, @Param('id') id: string) {
    return this.monitors.run(userId, id);
  }

  @Get('alerts')
  alerts(
    @UserId() userId: string,
    @Query('unread') unread?: string,
    @Query('monitor_id') monitorId?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.monitors.alerts(userId, {
      unread: unread === '1' || unread === 'true',
      monitorId,
      page: int(page, 1, 1, 200),
      limit: int(limit, 20, 1, 50),
    });
  }

  @Post('alerts/read')
  @HttpCode(200)
  markRead(@UserId() userId: string, @Body() body: unknown) {
    return this.monitors.markRead(userId, body);
  }
}
