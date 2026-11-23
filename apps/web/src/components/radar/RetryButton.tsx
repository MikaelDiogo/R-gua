'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Icon } from '@/components/Icon';

/** Recarrega só os dados do Radar (o servidor refaz as chamadas), sem sair da tela. */
export function RetryButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      className={['rg-btn', className].filter(Boolean).join(' ')}
      disabled={pending}
      onClick={() => start(() => router.refresh())}
    >
      <Icon name="refresh" size={14} /> {pending ? 'Tentando…' : 'Tentar de novo'}
    </button>
  );
}
