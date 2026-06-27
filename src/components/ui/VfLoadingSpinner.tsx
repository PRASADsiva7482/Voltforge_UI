export interface VfLoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export default function VfLoadingSpinner({ size = 'md', className = '' }: VfLoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'w-4 h-4 border-2',
    md: 'w-8 h-8 border-[3px]',
    lg: 'w-12 h-12 border-4',
  };

  return (
    <div className={`flex items-center justify-center ${className} select-none`}>
      <div className={`relative flex items-center justify-center ${size === 'sm' ? 'w-4 h-4' : size === 'md' ? 'w-8 h-8' : 'w-12 h-12'}`}>
        <div className={`absolute rounded-full border-volt-500/10 dark:border-volt-500/5 ${sizeClasses[size]}`} />
        <div className={`absolute rounded-full border-transparent border-t-volt-500 animate-spin ${sizeClasses[size]}`} />
      </div>
    </div>
  );
}
