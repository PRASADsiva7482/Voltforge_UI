import { useState } from 'react';
import { motion } from 'framer-motion';
import { Eye, GitFork, Clock, Cpu, Filter, TrendingUp, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import type { ProjectSummary } from '../../types';

export default function ExplorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery] = useState('');
  const [page, setPage] = useState(0);
  const [selectedBoard, setSelectedBoard] = useState<string>('ALL');

  const { data: projectsData, isLoading } = useQuery({
    queryKey: ['public-projects', page, searchQuery],
    queryFn: async () => {
      if (searchQuery.trim()) {
        const res = await projectApi.searchPublic(searchQuery, page, 12);
        return res.data.data;
      }
      const res = await projectApi.getPublic(page, 12);
      return res.data.data;
    },
  });

  const projects = projectsData?.content || [];
  const totalPages = projectsData?.totalPages || 0;

  const boardTypes = ['ALL', 'ARDUINO_UNO', 'ARDUINO_MEGA', 'ESP32', 'ESP32_S3', 'ESP8266'];

  const filteredProjects = selectedBoard === 'ALL'
    ? projects
    : projects.filter((p: ProjectSummary) => p.boardType === selectedBoard);

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
        className="mb-10"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-forge-500 to-forge-600 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-surface-950 dark:text-white">{t('Explore')}</h1>
        </div>
        <p className="text-surface-600 text-lg pl-[52px] dark:text-surface-400">{t('Discover amazing circuits built by the community')}</p>
      </motion.div>

      {/* Board Filters */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-8"
      >
        <div className="flex items-center gap-3 overflow-x-auto pb-1">
          <Filter className="w-4 h-4 text-surface-400 flex-shrink-0" />
          {boardTypes.map((board) => (
            <button
              key={board}
              onClick={() => setSelectedBoard(board)}
              className={`px-4 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                selectedBoard === board
                  ? 'bg-volt-500/20 text-volt-500 border border-volt-500/30 dark:text-volt-400'
                  : 'bg-white/80 text-surface-600 hover:text-surface-950 border border-surface-200 hover:border-surface-300 dark:bg-white/5 dark:text-surface-400 dark:hover:text-white dark:border-white/10 dark:hover:border-white/20'
              }`}
            >
              {board === 'ALL' ? 'All Boards' : board.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Results */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="glass rounded-2xl p-6 animate-pulse">
              <div className="h-40 bg-surface-200 rounded-xl mb-5 dark:bg-surface-800" />
              <div className="h-5 bg-surface-200 rounded w-3/4 mb-3 dark:bg-surface-800" />
              <div className="h-4 bg-surface-200 rounded w-1/2 dark:bg-surface-800" />
            </div>
          ))}
        </div>
      ) : filteredProjects.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass rounded-2xl p-16 flex flex-col items-center justify-center border border-dashed border-surface-300/70 dark:border-white/10"
        >
          <Search className="w-12 h-12 text-surface-600 mb-4" />
          <h3 className="text-lg font-medium text-surface-950 mb-2 dark:text-white">{t('No projects found')}</h3>
          <p className="text-surface-600 text-center max-w-sm dark:text-surface-400">
            {searchQuery ? `No results for "${searchQuery}". Try different search terms.` : 'Be the first to share a public project!'}
          </p>
        </motion.div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects.map((project: ProjectSummary, index: number) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                whileHover={{ y: -4, scale: 1.01 }}
                onClick={() => navigate(`/editor/${project.id}`)}
                className="glass glass-hover rounded-2xl p-5 cursor-pointer group transition-all duration-300"
              >
                {/* Thumbnail */}
                <div className={`h-36 rounded-xl bg-gradient-to-br ${boardColors[project.boardType] || 'from-surface-700 to-surface-800'} mb-4 flex items-center justify-center opacity-60 group-hover:opacity-80 transition-opacity relative overflow-hidden`}>
                  <Cpu className="w-14 h-14 text-white/40" />
                  <div className="absolute top-3 right-3">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-black/30 text-white/80 backdrop-blur-sm">
                      {project.boardType.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>

                {/* Info */}
                <h3 className="text-base font-semibold text-surface-950 mb-1 truncate dark:text-white">{project.name}</h3>
                <p className="text-xs text-surface-600 mb-3 line-clamp-2 min-h-[2.5rem] dark:text-surface-400">{project.description || 'No description'}</p>

                {/* Owner */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center text-[8px] font-bold text-white">
                    {project.owner?.displayName?.charAt(0) || '?'}
                  </div>
                  <span className="text-xs text-surface-600 dark:text-surface-400">{project.owner?.displayName || project.owner?.username}</span>
                </div>

                {/* Meta */}
                <div className="flex items-center gap-4 text-xs text-surface-500">
                  <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {project.viewCount}</span>
                  <span className="flex items-center gap-1"><GitFork className="w-3.5 h-3.5" /> {project.forkCount}</span>
                  <span className="flex items-center gap-1 ml-auto"><Clock className="w-3.5 h-3.5" /> {new Date(project.updatedAt).toLocaleDateString()}</span>
                </div>

                {/* Tags */}
                {project.tags && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {project.tags.split(',').slice(0, 3).map((tag) => (
                      <span key={tag} className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-medium bg-surface-100 text-surface-700 border border-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-700">
                        {tag.trim()}
                      </span>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-2 mt-10">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium glass glass-hover text-surface-700 disabled:opacity-30 disabled:cursor-not-allowed dark:text-surface-300"
              >
                Previous
              </button>
              <span className="text-sm text-surface-600 dark:text-surface-400">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-lg text-sm font-medium glass glass-hover text-surface-700 disabled:opacity-30 disabled:cursor-not-allowed dark:text-surface-300"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
