'use client';

/** Última rede de proteção: falha no próprio layout. Sem dependência de CSS ou de componentes. */
export default function ErroGlobal({ reset }: { reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: '#faf8f3',
          color: '#1b1a17',
        }}
      >
        <main style={{ maxWidth: 480, margin: '15vh auto', padding: 24 }}>
          <h1 style={{ fontSize: 24, fontWeight: 500 }}>Régua fora do ar por um instante</h1>
          <p style={{ color: '#3a3833', lineHeight: 1.5 }}>
            Algo falhou ao abrir a página. Seus dados estão salvos. Tente de novo em alguns
            segundos.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: 36,
              padding: '0 16px',
              borderRadius: 8,
              border: 0,
              background: '#1e6b5a',
              color: '#fff',
              fontSize: 14,
            }}
          >
            Tentar de novo
          </button>
        </main>
      </body>
    </html>
  );
}
