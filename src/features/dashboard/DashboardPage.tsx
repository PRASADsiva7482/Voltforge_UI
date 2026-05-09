import { motion } from 'framer-motion';
import { Plus, Search, Cpu, Eye, GitFork, Clock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import type { ProjectSummary } from '../../types';

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

  const projects = projectsData?.content || [];

  return (
    <div className="p-8 max-w-7xl mx-auto pt-16 pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-12"
      >
        <h1 className="text-4xl font-bold text-white mb-3">
          {t('Welcome back')}, <span className="bg-gradient-to-r from-volt-400 to-forge-400 bg-clip-text text-transparent">{user?.displayName || user?.username}</span>
        </h1>
        <p className="text-surface-400 text-lg">{t('Build, simulate, and share your electronics projects')}</p>
      </motion.div>

      {/* Quick Actions */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16"
      >
        <button
          onClick={() => navigate('/projects/new')}
          className="glass glass-hover p-8 rounded-2xl text-center flex flex-col items-center justify-center group cursor-pointer transition-all duration-300 hover:glow-volt"
        >
          <div className="w-16 h-16 rounded-2xl bg-volt-500/10 flex items-center justify-center mb-5 group-hover:bg-volt-500/20 transition-colors">
            <Plus className="w-8 h-8 text-volt-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('New Project')}</h3>
          <p className="text-sm text-surface-400">Start a new circuit from scratch</p>
        </button>

        <button
          onClick={() => navigate('/explore')}
          className="glass glass-hover p-8 rounded-2xl text-center flex flex-col items-center justify-center group cursor-pointer transition-all duration-300 hover:glow-forge"
        >
          <div className="w-16 h-16 rounded-2xl bg-forge-500/10 flex items-center justify-center mb-5 group-hover:bg-forge-500/20 transition-colors">
            <Search className="w-8 h-8 text-forge-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('Explore')}</h3>
          <p className="text-sm text-surface-400">Browse community projects</p>
        </button>

        <button
          onClick={() => navigate('/projects/new?ai=true')}
          className="glass glass-hover p-8 rounded-2xl text-center flex flex-col items-center justify-center group cursor-pointer transition-all duration-300"
          style={{ boxShadow: '0 0 20px rgba(139, 92, 246, 0.1)' }}
        >
          <div className="w-16 h-16 rounded-2xl bg-purple-500/10 flex items-center justify-center mb-5 group-hover:bg-purple-500/20 transition-colors">
            <Cpu className="w-8 h-8 text-purple-400" />
          </div>
          <h3 className="text-xl font-semibold text-white mb-2">{t('AI Generate')}</h3>
          <p className="text-sm text-surface-400">Let AI build your circuit</p>
        </button>
      </motion.div>

      {/* Recent Projects */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="flex items-center justify-between mb-8">
          <h2 className="text-2xl font-semibold text-white">{t('Recent Projects')}</h2>
          <button
            onClick={() => navigate('/projects')}
            className="text-sm text-volt-400 hover:text-volt-300 transition-colors font-medium"
          >
            View all →
          </button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass rounded-2xl p-6 animate-pulse">
                <div className="h-40 bg-surface-800 rounded-xl mb-5" />
                <div className="h-5 bg-surface-800 rounded w-3/4 mb-3" />
                <div className="h-4 bg-surface-800 rounded w-1/2" />
              </div>
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="glass rounded-2xl p-10 flex flex-col items-center justify-center border border-dashed border-white/10">
            <Cpu className="w-12 h-12 text-surface-600 mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">{t('No projects yet')}</h3>
            <p className="text-surface-400 mb-6 text-center max-w-sm">Create your first circuit to get started and see it appear here.</p>
            <button
              onClick={() => navigate('/projects/new')}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-volt-500 to-volt-600 text-white font-medium hover:from-volt-400 hover:to-volt-500 transition-all duration-300 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              {t('Create Project')}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map((project: ProjectSummary) => (
              <ProjectCard key={project.id} project={project} onClick={() => navigate(`/editor/${project.id}`)} />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

function ProjectCard({ project, onClick }: { project: ProjectSummary; onClick: () => void }) {
  const boardColors: Record<string, string> = {
    ARDUINO_UNO: 'from-blue-500 to-cyan-500',
    ARDUINO_MEGA: 'from-indigo-500 to-blue-500',
    ARDUINO_NANO: 'from-sky-500 to-blue-400',
    ESP32: 'from-emerald-500 to-green-500',
    ESP32_S3: 'from-teal-500 to-emerald-500',
    ESP8266: 'from-green-500 to-lime-500',
  };

  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      className="glass glass-hover rounded-2xl p-5 cursor-pointer group transition-all duration-300"
    >
      {/* Thumbnail */}
      <div className={`h-32 rounded-xl bg-gradient-to-br ${boardColors[project.boardType] || 'from-surface-700 to-surface-800'} mb-4 flex items-center justify-center opacity-60 group-hover:opacity-80 transition-opacity`}>
        <Cpu className="w-12 h-12 text-white/50" />
      </div>

      {/* Info */}
      <h3 className="text-base font-semibold text-white mb-1 truncate">{project.name}</h3>
      <p className="text-xs text-surface-400 mb-3 line-clamp-2">{project.description || 'No description'}</p>

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-surface-500">
        <span className="flex items-center gap-1">
          <Eye className="w-3.5 h-3.5" /> {project.viewCount}
        </span>
        <span className="flex items-center gap-1">
          <GitFork className="w-3.5 h-3.5" /> {project.forkCount}
        </span>
        <span className="flex items-center gap-1 ml-auto">
          <Clock className="w-3.5 h-3.5" />
          {new Date(project.updatedAt).toLocaleDateString()}
        </span>
      </div>

      {/* Board Badge */}
      <div className="mt-3">
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-800 text-surface-300 border border-surface-700">
          {project.boardType.replace(/_/g, ' ')}
        </span>
        {project.isPublic && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-volt-500/10 text-volt-400 border border-volt-500/20 ml-1">
            Public
          </span>
        )}
      </div>
    </motion.div>
  );
}
