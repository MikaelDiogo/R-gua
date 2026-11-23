import Link from 'next/link';
import { Icon } from './Icon';
import { PageHeader, StateBlock } from './ui';

/**
 * Tela cujo backend ainda não existe: diz com franqueza o que falta e para onde ir agora.
 * Sem dados de exemplo: só o que é verdade hoje.
 */
export function ComingSoon({
  title,
  lead,
  missing,
  children,
}: {
  title: string;
  lead: string;
  /** O que precisa existir para esta tela funcionar. */
  missing: string;
  children?: string;
}) {
  return (
    <>
      <PageHeader title={title} lead={lead} />
      <StateBlock
        kind="empty"
        title={missing}
        action={
          <Link href="/busca" className="rg-btn rg-btn-primary wk-sm">
            <Icon name="search" size={14} /> Buscar editais
          </Link>
        }
      >
        {children}
      </StateBlock>
    </>
  );
}
