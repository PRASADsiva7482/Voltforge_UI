import VfAvatar from './VfAvatar';

export interface VfCollaborator {
  id: string;
  name: string;
  avatarUrl?: string;
  color?: string; // fallback color
}

export interface VfAvatarGroupProps {
  users: VfCollaborator[];
  max?: number;
  size?: 'sm' | 'md';
}

export default function VfAvatarGroup({ users, max = 4, size = 'sm' }: VfAvatarGroupProps) {
  const visibleUsers = users.slice(0, max);
  const remainingCount = Math.max(0, users.length - max);
  const sizeClasses = size === 'sm' ? 'w-6 h-6 text-[9px]' : 'w-8 h-8 text-xs';

  return (
    <div className="flex items-center -space-x-2.5 overflow-hidden">
      {visibleUsers.map((u) => (
        <div
          key={u.id}
          className="ring-2 ring-white dark:ring-slate-950 rounded-full transition-transform hover:translate-y-[-2px] hover:z-10 cursor-pointer"
          title={u.name}
        >
          <VfAvatar src={u.avatarUrl} name={u.name} size={size} />
        </div>
      ))}
      {remainingCount > 0 && (
        <div
          className={`flex items-center justify-center rounded-full bg-slate-100 text-slate-600 font-bold border-2 border-white dark:bg-slate-800 dark:text-slate-300 dark:border-slate-955 shrink-0 ${sizeClasses}`}
          title={`${remainingCount} more users`}
        >
          +{remainingCount}
        </div>
      )}
    </div>
  );
}
