import { useState } from 'react';

export interface VfAvatarProps {
  src?: string;
  name?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const GRADIENTS = [
  'from-blue-500 to-cyan-500',
  'from-emerald-500 to-green-500',
  'from-purple-500 to-pink-500',
  'from-orange-500 to-red-500',
  'from-teal-500 to-emerald-500',
  'from-indigo-500 to-blue-500',
];

function getHashGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % GRADIENTS.length;
  return GRADIENTS[index];
}

export default function VfAvatar({ src, name = 'User', size = 'md', className = '' }: VfAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const initials = name.charAt(0).toUpperCase() || 'U';

  const sizeClasses = {
    sm: 'w-7 h-7 text-xs rounded-lg',
    md: 'w-10 h-10 text-sm rounded-xl',
    lg: 'w-20 h-20 text-2xl rounded-2xl',
  };

  const gradient = getHashGradient(name);

  return (
    <div className={`overflow-hidden flex-shrink-0 flex items-center justify-center font-bold text-white shadow-md border border-white/10 bg-gradient-to-br ${gradient} ${sizeClasses[size]} ${className}`}>
      {src && !hasError ? (
        <img
          src={src}
          alt={name}
          onError={() => setHasError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        initials
      )}
    </div>
  );
}
