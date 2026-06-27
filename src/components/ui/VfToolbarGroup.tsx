import { ReactNode } from 'react';

export interface VfToolbarGroupProps {
  children: ReactNode;
  divider?: 'left' | 'right' | 'both' | 'none';
  className?: string;
}

export default function VfToolbarGroup({
  children,
  divider = 'none',
  className = '',
}: VfToolbarGroupProps) {
  const showLeftDivider = divider === 'left' || divider === 'both';
  const showRightDivider = divider === 'right' || divider === 'both';

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      {showLeftDivider && <div className="toolbar-divider" />}
      <div className="flex items-center gap-1">{children}</div>
      {showRightDivider && <div className="toolbar-divider" />}
    </div>
  );
}
