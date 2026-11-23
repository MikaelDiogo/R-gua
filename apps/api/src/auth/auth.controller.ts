import { ChangePasswordRequest, LoginRequest } from '@agora/contracts';
import { Body, Controller, Get, Headers, HttpCode, Post, Req, Res } from '@nestjs/common';
import type { FastifyReply } from 'fastify';
import { MonitorsService } from '../monitors/monitors.service';
import { type AuthedRequest, CurrentUser, Public, readCookie } from './auth.guard';
import { AuthService, SESSION_COOKIE, type SessionUser } from './auth.service';

/** HttpOnly (JavaScript não lê), SameSite=Lax (não vai em POST de outro site) e Secure quando atrás de HTTPS. */
function cookie(value: string, maxAgeSeconds: number): string {
  const secure =
    process.env.COOKIE_SECURE === '1' ||
    (process.env.NODE_ENV === 'production' && process.env.COOKIE_SECURE !== '0')
      ? '; Secure'
      : '';
  return `${SESSION_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

@Controller('v1')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly monitors: MonitorsService,
  ) {}

  @Public()
  @Post('auth/login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Headers('user-agent') ua: string | undefined,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    const r = await this.auth.login(LoginRequest.parse(body ?? {}), ua);
    // Monitores fixos não podem impedir a entrada: falha aqui é registrada e o login segue.
    await this.monitors
      .ensureDefaults(r.user.id)
      .catch((e) => console.error('monitores fixos:', e));
    void reply
      .header('set-cookie', cookie(r.token, r.maxAgeSeconds))
      .header('cache-control', 'no-store');
    return this.auth.me(r.user);
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: AuthedRequest, @Res({ passthrough: true }) reply: FastifyReply) {
    await this.auth.logout(readCookie(req.headers.cookie, SESSION_COOKIE));
    void reply.header('set-cookie', cookie('', 0));
  }

  /** Troca a própria senha: exige a atual e encerra as outras sessões. A identidade vem da sessão. */
  @Post('auth/password')
  @HttpCode(204)
  async changePassword(
    @Body() body: unknown,
    @CurrentUser() user: SessionUser,
    @Req() req: AuthedRequest,
  ) {
    await this.auth.changePassword(
      user.id,
      user.username,
      ChangePasswordRequest.parse(body ?? {}),
      readCookie(req.headers.cookie, SESSION_COOKIE),
    );
  }

  @Get('me')
  me(@CurrentUser() user: SessionUser) {
    return this.auth.me(user);
  }
}
