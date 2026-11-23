import {
  type CompanyProfile,
  type CompanyProfileResponse,
  SaveCompanyProfile,
} from '@agora/contracts';
import { type Db, withUser } from '@agora/db';
import { isValidCnpj, onlyDigits } from '@agora/domain';
import { Injectable } from '@nestjs/common';
import { type Clock, InjectClock, InjectDb } from '../platform/db.module';
import { DomainError } from '../platform/problem.filter';

/** Campos que a proposta precisa e ainda faltam no perfil. */
export function missingForProposal(p: CompanyProfile | null): string[] {
  if (!p)
    return [
      'Razão social',
      'CNPJ',
      'Representante legal',
      'Contato (e-mail ou telefone)',
      'Endereço',
    ];
  const m: string[] = [];
  if (!p.legal_name?.trim()) m.push('Razão social');
  if (!p.cnpj?.trim()) m.push('CNPJ');
  else if (!isValidCnpj(p.cnpj)) m.push('CNPJ válido');
  if (!p.legal_rep_name?.trim()) m.push('Representante legal');
  if (!p.email?.trim() && !p.phone?.trim()) m.push('Contato (e-mail ou telefone)');
  if (!p.address?.trim()) m.push('Endereço');
  return m;
}

@Injectable()
export class ProfileService {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectClock() private readonly clock: Clock,
  ) {}

  private view(profile: CompanyProfile | null, version: number): CompanyProfileResponse {
    return {
      profile,
      version,
      missing_for_proposal: missingForProposal(profile),
      server_now: this.clock().toISOString(),
    };
  }

  async get(userId: string): Promise<CompanyProfileResponse> {
    return withUser(this.db, userId, async (c) => {
      const r = await c.query<{ profile: CompanyProfile; version: number }>(
        'SELECT profile, version FROM company_profiles',
      );
      const row = r.rows[0];
      return this.view(row?.profile ?? null, row?.version ?? 0);
    });
  }

  async save(
    userId: string,
    body: unknown,
    ifMatch: string | undefined,
  ): Promise<CompanyProfileResponse> {
    const input = SaveCompanyProfile.parse(body);
    // CNPJ preenchido precisa ser válido; guarda só os dígitos formatados de forma estável.
    if (input.cnpj.trim() && !isValidCnpj(input.cnpj)) {
      throw new DomainError('validation_failed', 'O CNPJ informado não é válido.', {
        field: 'cnpj',
      });
    }
    const profile: CompanyProfile = {
      ...input,
      cnpj: input.cnpj.trim() ? onlyDigits(input.cnpj) : '',
    };
    return withUser(this.db, userId, async (c) => {
      const cur = await c.query<{ version: number }>(
        'SELECT version FROM company_profiles FOR UPDATE',
      );
      const row = cur.rows[0];
      if (row) {
        const v = Number((ifMatch ?? '').replace(/["W/]/g, ''));
        if (ifMatch !== undefined && v !== row.version) {
          const now = await this.get(userId);
          throw new DomainError(
            'version_conflict',
            'O perfil foi alterado em outra aba. Recarregue.',
            { current: now },
          );
        }
        await c.query(
          'UPDATE company_profiles SET profile = $1, version = version + 1, updated_at = now()',
          [JSON.stringify(profile)],
        );
        return this.view(profile, row.version + 1);
      }
      await c.query('INSERT INTO company_profiles (user_id, profile) VALUES ($1, $2)', [
        userId,
        JSON.stringify(profile),
      ]);
      return this.view(profile, 1);
    });
  }
}
