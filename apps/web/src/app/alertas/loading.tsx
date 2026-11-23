import { PageHeader, SkeletonRows } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <PageHeader title="Alertas" />
      <SkeletonRows rows={5} label="Carregando alertas" />
    </>
  );
}
