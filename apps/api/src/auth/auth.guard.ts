import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FastifyRequest } from 'fastify';
import { DomainError } from '../platform/problem.filter';
import { AuthService, SESSION_COOKIE, type SessionUser } from './auth.service';

const PUBLIC = 'isPublic';
/** Rotas abertas (saúde, cadastro, entrada). Todo o resto exige sessão. */
export const Public = () => SetMetadata(PUBLIC, true);

export type AuthedRequest = FastifyRequest & { user?: SessionUser };

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name)
      return decodeURIComponent(part.slice(i + 1).trim());
  }
  return undefined;
}

/** Guarda global: identidade vem só do cookie de sessão, nunca do corpo ou de cabeçalho do cliente (docs/04 §2). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC, [ctx.getHandler(), ctx.getClass()]))
      return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const user = await this.auth.validate(readCookie(req.headers.cookie, SESSION_COOKIE));
    if (!user) throw new DomainError('unauthenticated', 'Entre para continuar.');
    req.user = user;
    return true;
  }
}

/** Id do usuário autenticado (definido pela guarda). */
export const UserId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
  if (!user) throw new DomainError('unauthenticated', 'Entre para continuar.');
  return user.id;
});

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SessionUser => {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (!user) throw new DomainError('unauthenticated', 'Entre para continuar.');
    return user;
  },
);
