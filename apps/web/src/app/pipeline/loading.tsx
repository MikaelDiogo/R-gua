import { PageHeader, SkeletonRows } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <PageHeader title="Funil" />
      <SkeletonRows rows={5} label="Carregando o funil" />
    </>
  );
}
