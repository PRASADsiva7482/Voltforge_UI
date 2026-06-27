import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Cpu, FolderOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import type { ProjectSummary } from '../../types';
import VfButton from '../../components/ui/VfButton';
import VfInput from '../../components/ui/VfInput';
import VfPageHeader from '../../components/ui/VfPageHeader';
import VfProjectGrid from '../../components/ui/VfProjectGrid';
import VfEmptyState from '../../components/ui/VfEmptyState';
import VfPagination from '../../components/ui/VfPagination';

export default function ProjectsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(0);
  const [searchFilter, setSearchFilter] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['user-projects-all', page],
    queryFn: async () => {
      const res = await projectApi.getUserProjects(page, 12);
      return res.data.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => projectApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-projects-all'] });
      queryClient.invalidateQueries({ queryKey: ['user-projects'] });
      setMenuOpenId(null);
    },
  });

  const projects = projectsData?.content || [];
  const totalPages = projectsData?.totalPages || 0;

  const filteredProjects = searchFilter
    ? projects.filter(p => p.name.toLowerCase().includes(searchFilter.toLowerCase()))
    : projects;



  return (
    <div className="p-8 max-w-7xl mx-auto pt-10 pb-24">
      {/* Header */}
      <VfPageHeader
        title={t('My Projects')}
        description={`${projects.length} ${t('projects total')}`}
        icon={<FolderOpen className="w-5 h-5 text-white" />}
        actions={
          <VfButton variant="primary" size="md" onClick={() => navigate('/projects/new')}
            icon={<Plus className="w-4 h-4" />}>
            {t('New Project')}
          </VfButton>
        }
      />

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-10"
      >
        <div className="max-w-md">
          <VfInput
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder={t('Filter projects...')}
            inputSize="md"
            iconLeft={<Search className="w-4 h-4" />}
          />
        </div>
      </motion.div>

      <VfProjectGrid
        projects={filteredProjects}
        isLoading={isLoading}
        skeletonCount={3}
        onProjectClick={(project) => navigate(`/editor/${project.id}`)}
        onProjectDelete={(id) => deleteMutation.mutate(id)}
        emptyState={
          <VfEmptyState
            icon={<Cpu className="w-12 h-12" />}
            title={searchFilter ? t('No matching projects') : t('No projects yet')}
            description={
              searchFilter
                ? t('Try a different filter.')
                : t('Create your first circuit to get started.')
            }
            actionText={!searchFilter ? t('Create Project') : undefined}
            onActionClick={!searchFilter ? () => navigate('/projects/new') : undefined}
            actionIcon={<Plus className="w-4 h-4" />}
          />
        }
      />

      <VfPagination
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
