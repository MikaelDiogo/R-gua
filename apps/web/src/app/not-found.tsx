import Link from 'next/link';

export default function NaoEncontrada() {
  return (
    <div className="rg-stage-col">
      <div className="rg-empty">
        <div className="rg-empty-head">Página não encontrada</div>
        <div className="rg-empty-body">
          <p className="rg-empty-title">Esse endereço não existe ou você não tem acesso.</p>
          <p>Confira o link ou volte para o começo.</p>
          <Link className="rg-btn rg-btn-primary" href="/">
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}
