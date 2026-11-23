import { Icon } from '../Icon';
import s from './monitores.module.css';

/** Aviso fixo e discreto: o canal e-mail ainda não existe. Neutro, sem cor de erro. */
export function EmailNotice() {
  return (
    <aside className={`rg-banner ${s.emailNotice}`} aria-label="Aviso sobre e-mail">
      <Icon name="info" size={16} />
      <div className="rg-banner-body">
        <p>
          Envio de alertas por e-mail ainda não está implementado. Por enquanto os avisos aparecem
          só em Alertas, dentro do Régua.
        </p>
      </div>
    </aside>
  );
}
