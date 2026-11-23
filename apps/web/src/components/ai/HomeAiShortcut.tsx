import { Icon } from '../Icon';
import s from './ai.module.css';

/**
 * Atalho do Início. Fica DENTRO do formulário da busca: este botão envia o texto digitado como `q` junto com
 * `modo=ia` para /busca, sem precisar de JavaScript.
 */
export function HomeAiShortcut() {
  return (
    <p className={s.shortcut}>
      Prefere explicar com suas palavras?
      <button type="submit" name="modo" value="ia" className={s.shortcutBtn}>
        <Icon name="sparkle" size={14} /> Descreva o que procura
      </button>
    </p>
  );
}
