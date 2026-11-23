import { PageHeader, SkeletonRows } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <PageHeader title="Monitores" />
      <SkeletonRows rows={4} label="Carregando monitores" />
    </>
  );
}
