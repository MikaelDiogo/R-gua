import { PageHeader, SkeletonRows } from '@/components/ui';

export default function Loading() {
  return (
    <>
      <PageHeader title="Monitor" />
      <SkeletonRows rows={5} label="Carregando monitor" />
    </>
  );
}
