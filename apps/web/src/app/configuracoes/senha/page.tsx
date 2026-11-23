import { PasswordForm } from '@/components/conta/PasswordForm';
import { PageHeader } from '@/components/ui';

export const metadata = { title: 'Alterar senha · Régua' };

export default function SenhaPage() {
  return (
    <>
      <PageHeader
        title="Alterar senha"
        lead="Use pelo menos 10 caracteres. Frases longas são mais seguras."
      />
      <PasswordForm />
    </>
  );
}
