import { PageHeader, SkeletonRows } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <PageHeader title="Pipeline" />
      <SkeletonRows rows={5} label="Carregando o pipeline" />
    </>
  );
}
