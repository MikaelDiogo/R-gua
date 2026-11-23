import { AuthForm } from '@/components/auth/AuthForm';

export const metadata = { title: 'Entrar · Régua' };

export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const next = (await searchParams).next;
  return <AuthForm next={typeof next === 'string' ? next : undefined} />;
}
