import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import type { AuthedRequest } from '../auth/auth.guard';
import { DomainError } from '../platform/problem.filter';

/**
 * Só o papel `admin`. Roda depois da guarda global de sessão, que leu o papel do banco nesta mesma requisição:
 * nada do cliente (corpo, cabeçalho, cookie) decide quem é administrador (docs/04 §2).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const user = ctx.switchToHttp().getRequest<AuthedRequest>().user;
    if (user?.role !== 'admin')
      throw new DomainError('forbidden', 'Só administradores acessam esta área.');
    return true;
  }
}
