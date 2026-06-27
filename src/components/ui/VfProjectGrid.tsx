import { ReactNode } from 'react';
import { motion } from 'framer-motion';
import VfProjectCard from './VfProjectCard';
import VfCardSkeleton from './VfCardSkeleton';
import type { ProjectSummary } from '../../types';

export interface VfProjectGridProps {
  projects: ProjectSummary[];
  isLoading?: boolean;
  skeletonCount?: number;
  columns?: 3 | 4;
  showOwner?: boolean;
  onProjectClick: (project: ProjectSummary) => void;
  onProjectDelete?: (id: string) => void;
  emptyState?: ReactNode;
}

export default function VfProjectGrid({
  projects,
  isLoading = false,
  skeletonCount = 6,
  columns = 3,
  showOwner = false,
  onProjectClick,
  onProjectDelete,
  emptyState,
}: VfProjectGridProps) {
  if (isLoading) {
    return <VfCardSkeleton count={skeletonCount} />;
  }

  if (projects.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  const gridCols = columns === 4 
    ? 'grid-cols-1 md:grid-cols-2 lg:grid-cols-4' 
    : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';

  // Stagger entry animations for items
  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.05 }
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className={`grid ${gridCols} gap-6`}
    >
      {projects.map((project) => (
        <VfProjectCard
          key={project.id}
          project={project}
          onClick={() => onProjectClick(project)}
          onDelete={onProjectDelete}
          showOwner={showOwner}
        />
      ))}
    </motion.div>
  );
}
