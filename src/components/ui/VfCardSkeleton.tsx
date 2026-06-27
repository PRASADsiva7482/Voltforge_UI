export interface VfCardSkeletonProps {
  count?: number;
  layout?: 'grid' | 'list';
}

export default function VfCardSkeleton({ count = 3, layout = 'grid' }: VfCardSkeletonProps) {
  const cards = Array.from({ length: count });

  return (
    <div className={layout === 'grid' ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' : 'space-y-4'}>
      {cards.map((_, i) => (
        <div
          key={i}
          className="glass relative overflow-hidden rounded-2xl p-5 border border-slate-200 dark:border-white/5 bg-white/70 dark:bg-slate-900/40 backdrop-blur-md"
        >
          {/* animated pulsing skeleton content */}
          <div className="animate-pulse flex flex-col h-full">
            <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-xl mb-4 w-full" />
            <div className="h-5 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mb-3" />
            <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-1/2 mb-5" />
            <div className="flex items-center gap-4 mt-auto">
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-10" />
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-10" />
              <div className="h-3 bg-slate-200 dark:bg-slate-800 rounded w-16 ml-auto" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
