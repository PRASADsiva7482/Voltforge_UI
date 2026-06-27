import { motion } from 'framer-motion';
import { Plus, Search, Cpu, Eye, GitFork, Clock } from 'lucide-react';
import VfButton from '../../components/ui/VfButton';
import VfProjectGrid from '../../components/ui/VfProjectGrid';
import VfEmptyState from '../../components/ui/VfEmptyState';
import VfCard from '../../components/ui/VfCard';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import type { ProjectSummary } from '../../types';
import keycloak from '../../utils/keycloak';
import { SMART_DEVICE_PRESET } from '../../store/projectStore';

export default function DashboardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['user-projects'],
    queryFn: async () => {
      const res = await projectApi.getUserProjects(0, 10);
      return res.data.data;
    },
  });

  const { data: templatesData } = useQuery({
    queryKey: ['templates'],
    queryFn: async () => {
      const res = await projectApi.getTemplates(0, 4);
      return res.data.data;
    },
  });

  const projects = projectsData?.content || [];
  const templatesFromDb = templatesData?.content || [];
  const templates = [...templatesFromDb];
  if (!templates.some(t => t.id === 'preset-smart-device')) {
    templates.unshift({
      id: SMART_DEVICE_PRESET.id,
      name: SMART_DEVICE_PRESET.name,
      description: SMART_DEVICE_PRESET.description,
      boardType: SMART_DEVICE_PRESET.boardType,
      isPublic: SMART_DEVICE_PRESET.isPublic,
      forkCount: SMART_DEVICE_PRESET.forkCount,
      viewCount: SMART_DEVICE_PRESET.viewCount,
      tags: SMART_DEVICE_PRESET.tags,
      owner: SMART_DEVICE_PRESET.owner,
      createdAt: SMART_DEVICE_PRESET.createdAt,
      updatedAt: SMART_DEVICE_PRESET.updatedAt,
    });
  }

  return (
    <div className="p-8 max-w-7xl mx-auto pt-10 pb-24">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-14"
      >
        <h1 className="text-4xl font-bold text-surface-950 mb-3 dark:text-white">
          {t('Welcome back')}, <span className="bg-gradient-to-r from-volt-400 to-forge-400 bg-clip-text text-transparent">{user?.displayName || user?.username || keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || user?.email}</span>
        </h1>
        <p className="text-surface-600 text-base dark:text-surface-400">{t('Build, simulate, and share your electronics projects')}</p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-14"
      >
        <VfCard
          animate
          hoverGlow="volt"
          onClick={() => navigate('/projects/new')}
          className="text-center flex flex-col items-center justify-center group p-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-volt-500/10 flex items-center justify-center mb-5 group-hover:bg-volt-500/20 transition-colors">
            <Plus className="w-8 h-8 text-volt-400" />
          </div>
          <h3 className="text-xl font-semibold text-surface-950 mb-2 dark:text-white">{t('New Project')}</h3>
          <p className="text-sm text-surface-600 dark:text-surface-400">{t('Start a new circuit from scratch')}</p>
        </VfCard>

        <VfCard
          animate
          hoverGlow="forge"
          onClick={() => navigate('/explore')}
          className="text-center flex flex-col items-center justify-center group p-8"
        >
          <div className="w-16 h-16 rounded-2xl bg-forge-500/10 flex items-center justify-center mb-5 group-hover:bg-forge-500/20 transition-colors">
            <Search className="w-8 h-8 text-forge-400" />
          </div>
          <h3 className="text-xl font-semibold text-surface-950 mb-2 dark:text-white">{t('Explore')}</h3>
          <p className="text-sm text-surface-600 dark:text-surface-400">{t('Browse community projects')}</p>
        </VfCard>
      </motion.div>

      {/* Starter Templates */}
      {templates.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-16"
        >
          <div className="flex items-center justify-between mb-10">
            <h2 className="text-2xl font-semibold text-surface-950 dark:text-white">{t('Starter Templates')}</h2>
          </div>
          <VfProjectGrid
            projects={templates}
            columns={4}
            onProjectClick={(template) => navigate(`/editor/${template.id}`)}
          />
        </motion.div>
      )}

      {/* Recent Projects */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-10">
          <h2 className="text-2xl font-semibold text-surface-950 dark:text-white">{t('Recent Projects')}</h2>
          <VfButton variant="ghost" size="sm" onClick={() => navigate('/projects')}>
            {t('View all')} →
          </VfButton>
        </div>

        <VfProjectGrid
          projects={projects}
          isLoading={isLoading}
          skeletonCount={3}
          columns={3}
          onProjectClick={(project) => navigate(`/editor/${project.id}`)}
          emptyState={
            <VfEmptyState
              icon={<Cpu className="w-12 h-12" />}
              title={t('No projects yet')}
              description={t('Create your first circuit to get started and see it appear here.')}
              actionText={t('Create Project')}
              onActionClick={() => navigate('/projects/new')}
              actionIcon={<Plus className="w-4 h-4" />}
            />
          }
        />
      </motion.div>
    </div>
  );
}

