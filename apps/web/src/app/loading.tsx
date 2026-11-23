import { PageHeader, SkeletonRows } from '@/components/ui';

/** Carregando: o layout final com barras cinza, sem deslocamento quando o dado chega. */
export default function Loading() {
  return (
    <>
      <PageHeader title="Carregando" />
      <SkeletonRows rows={6} label="Carregando" />
    </>
  );
}
