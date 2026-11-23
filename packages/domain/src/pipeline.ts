import type { PipelineState } from '@agora/contracts';

export const PIPELINE_COLUMNS: Array<{ key: PipelineState; label: string }> = [
  { key: 'descoberto', label: 'Descoberto' },
  { key: 'em_analise', label: 'Em análise' },
  { key: 'em_preparacao', label: 'Em preparação' },
  { key: 'proposta_enviada', label: 'Proposta enviada' },
  { key: 'em_disputa', label: 'Em disputa' },
  { key: 'ganho', label: 'Ganho' },
  { key: 'perdido', label: 'Perdido' },
  { key: 'desistencia', label: 'Desistência' },
  { key: 'descartado', label: 'Descartado' },
];

const TERMINAL: PipelineState[] = ['ganho', 'perdido', 'desistencia', 'descartado'];
export const isTerminal = (s: PipelineState) => TERMINAL.includes(s);

type Role = 'owner' | 'admin' | 'member' | 'viewer';
export type TransitionResult = { ok: true } | { ok: false; reason: string };

/**
 * Máquina de estados do card (docs/04 §3). Fica no domínio, não no front.
 * Entre etapas ativas o movimento é livre (avançar ou voltar); as regras valem para os estados finais.
 * Reabrir um card final exige papel admin/owner. Pré-condições com anexos (proposta anexada) entram com documentos.
 */
export function canTransition(
  from: PipelineState,
  to: PipelineState,
  role: Role,
): TransitionResult {
  if (from === to) return { ok: false, reason: 'O card já está nesta etapa.' };
  if (role === 'viewer') return { ok: false, reason: 'Seu papel permite só visualizar.' };
  if (isTerminal(from)) {
    if (to === 'em_analise' && (role === 'owner' || role === 'admin')) return { ok: true };
    return {
      ok: false,
      reason: 'Card encerrado: só um administrador pode reabri-lo (para "Em análise").',
    };
  }
  switch (to) {
    case 'ganho':
      return from === 'em_disputa'
        ? { ok: true }
        : { ok: false, reason: 'Só é possível marcar "Ganho" a partir de "Em disputa".' };
    case 'perdido':
      return from === 'proposta_enviada' || from === 'em_disputa'
        ? { ok: true }
        : {
            ok: false,
            reason:
              'Só é possível marcar "Perdido" depois de enviar a proposta ou entrar em disputa.',
          };
    case 'descartado':
      return ['descoberto', 'em_analise', 'em_preparacao'].includes(from)
        ? { ok: true }
        : {
            ok: false,
            reason: 'Depois de enviar a proposta use "Desistência" em vez de "Descartado".',
          };
    default:
      return { ok: true };
  }
}
