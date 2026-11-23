import { Skeleton } from '@/components/ui';
import s from './forYou.module.css';

/** Carregando: o resto do Radar já aparece; esta seção chega logo depois (Suspense). */
export function ForYouSkeleton() {
  return (
    <section className="radarBlock" aria-busy="true" aria-label="Carregando sugestões para você">
      <div className="radarBlockHead">
        <h2>Para você</h2>
      </div>
      <p className={s.lead}>Editais abertos que combinam com o que você pesquisou e vigia.</p>
      <ul className="radarList">
        {[0, 1, 2].map((i) => (
          <li key={i} className={s.skelRow}>
            <div className={s.skelStack}>
              <Skeleton w="82%" h={16} />
              <Skeleton w="48%" h={12} />
            </div>
            <div className={s.skelStack}>
              <Skeleton w="40%" h={14} />
              <Skeleton w="100%" h={10} />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
