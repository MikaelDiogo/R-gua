'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Erro inesperado numa tela: mostra o que fazer, nunca uma página em branco nem detalhe técnico. */
export default function ErroDaTela({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('erro na tela', error.digest ?? '', error.message);
  }, [error]);
  return (
    <div className="rg-stage-col" role="alert">
      <div className="rg-banner rg-banner-error">
        <div className="rg-banner-body">
          <p className="rg-banner-title">Esta tela não carregou</p>
          <p>
            Algo falhou do nosso lado. Seus dados estão salvos. Tente de novo; se continuar, volte
            ao início.
            {error.digest ? ` Código: ${error.digest}.` : ''}
          </p>
        </div>
        <button type="button" className="rg-btn rg-btn-primary" onClick={reset}>
          Tentar de novo
        </button>
        <Link className="rg-btn" href="/">
          Voltar ao início
        </Link>
      </div>
    </div>
  );
}
