import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, Cpu, Eye, GitFork, Clock, Trash2, Globe, Lock, MoreVertical } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import type { ProjectSummary } from '../../types';

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

  const boardColors: Record<string, string> = {
    ARDUINO_UNO: 'from-blue-500 to-cyan-500',
    ARDUINO_MEGA: 'from-indigo-500 to-blue-500',
    ARDUINO_NANO: 'from-sky-500 to-blue-400',
    ESP32: 'from-emerald-500 to-green-500',
    ESP32_S3: 'from-teal-500 to-emerald-500',
    ESP8266: 'from-green-500 to-lime-500',
  };

  return (
    <div className="p-8 max-w-7xl mx-auto pt-8 pb-20">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-center md:justify-between mb-10 gap-4"
      >
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">{t('My Projects')}</h1>
          <p className="text-surface-400">{projects.length} {t('projects total')}</p>
        </div>
        <button
          onClick={() => navigate('/projects/new')}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-volt-500 to-volt-600 text-white font-medium hover:from-volt-400 hover:to-volt-500 transition-all duration-300 shadow-[0_0_20px_rgba(34,197,94,0.3)]"
        >
          <Plus className="w-5 h-5" />
          {t('New Project')}
        </button>
      </motion.div>

      {/* Search */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="mb-8"
      >
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-surface-400" />
          <input
            type="text"
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            placeholder={t('Filter projects...')}
            className="w-full pl-11 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all"
          />
        </div>
      </motion.div>

      {/* Projects Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 animate-pulse">
              <div className="h-36 bg-surface-800 rounded-xl mb-5" />
              <div className="h-5 bg-surface-800 rounded w-3/4 mb-3" />
              <div className="h-4 bg-surface-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="glass rounded-2xl p-16 flex flex-col items-center justify-center border border-dashed border-white/10">
          <Cpu className="w-12 h-12 text-surface-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            {searchFilter ? t('No matching projects') : t('No projects yet')}
          </h3>
          <p className="text-surface-400 mb-6 text-center max-w-sm">
            {searchFilter ? 'Try a different filter.' : 'Create your first circuit to get started.'}
          </p>
          {!searchFilter && (
            <button
              onClick={() => navigate('/projects/new')}
              className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-volt-500 to-volt-600 text-white font-medium hover:from-volt-400 hover:to-volt-500 transition-all duration-300 shadow-[0_0_15px_rgba(34,197,94,0.3)]"
            >
              {t('Create Project')}
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project: ProjectSummary, index: number) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.04 }}
              whileHover={{ y: -4, scale: 1.01 }}
              className="glass glass-hover rounded-2xl p-5 cursor-pointer group transition-all duration-300 relative"
            >
              {/* Context Menu */}
              <div className="absolute top-4 right-4 z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === project.id ? null : project.id); }}
                  className="p-1.5 rounded-lg bg-surface-800/80 text-surface-400 hover:text-white hover:bg-surface-700 opacity-0 group-hover:opacity-100 transition-all"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                <AnimatePresence>
                  {menuOpenId === project.id && (
                    <motion.div
                      initial={{ opacity: 0, y: -5, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -5, scale: 0.95 }}
                      className="absolute right-0 mt-1 w-36 glass border border-white/10 rounded-xl shadow-xl overflow-hidden"
                    >
                      <button
                        onClick={(e) => { e.stopPropagation(); if (confirm('Delete this project?')) deleteMutation.mutate(project.id); }}
                        className="w-full text-left px-4 py-2.5 text-xs text-red-400 hover:bg-red-500/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div onClick={() => navigate(`/editor/${project.id}`)}>
                {/* Thumbnail */}
                <div className={`h-32 rounded-xl bg-gradient-to-br ${boardColors[project.boardType] || 'from-surface-700 to-surface-800'} mb-4 flex items-center justify-center opacity-60 group-hover:opacity-80 transition-opacity`}>
                  <Cpu className="w-12 h-12 text-white/50" />
                </div>

                {/* Info */}
                <h3 className="text-base font-semibold text-white mb-1 truncate">{project.name}</h3>
                <p className="text-xs text-surface-400 mb-3 line-clamp-2">{project.description || 'No description'}</p>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-surface-500">
                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {project.viewCount}</span>
                  <span className="flex items-center gap-1"><GitFork className="w-3.5 h-3.5" /> {project.forkCount}</span>
                  <span className="flex items-center gap-1 ml-auto"><Clock className="w-3.5 h-3.5" /> {new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>

                {/* Badges */}
                <div className="mt-3 flex items-center gap-1">
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-800 text-surface-300 border border-surface-700">
                    {project.boardType.replace(/_/g, ' ')}
                  </span>
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium ${project.isPublic ? 'bg-volt-500/10 text-volt-400 border border-volt-500/20' : 'bg-surface-800 text-surface-400 border border-surface-700'}`}>
                    {project.isPublic ? <><Globe className="w-2.5 h-2.5" /> Public</> : <><Lock className="w-2.5 h-2.5" /> Private</>}
                  </span>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-2 mt-10">
          <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
            className="px-4 py-2 rounded-lg text-sm font-medium glass glass-hover text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed">
            Previous
          </button>
          <span className="text-sm text-surface-400">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
            className="px-4 py-2 rounded-lg text-sm font-medium glass glass-hover text-surface-300 disabled:opacity-30 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
      )}
    </div>
  );
}
