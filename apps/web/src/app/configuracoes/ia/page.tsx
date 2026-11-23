import { ComingSoon } from '@/components/ComingSoon';

export const metadata = { title: 'IA · Configurações · Régua' };

export default function IaPage() {
  return (
    <ComingSoon
      title="Configurações · IA"
      lead="Provedor, chave e modelo usados pela IA da Régua."
      missing="Disponível quando a IA (Gemini) estiver configurada."
    >
      A chave fica guardada só no servidor e nunca volta ao navegador. A tela de troca de provedor
      chega junto com a primeira integração.
    </ComingSoon>
  );
}
