import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Cpu, Eye, GitFork, Clock, Globe, Lock, MoreVertical, Trash2 } from 'lucide-react';
import type { ProjectSummary } from '../../types';
import { useTranslation } from 'react-i18next';
import VfConfirmDialog from './VfConfirmDialog';
import VfBadge from './VfBadge';

export interface VfProjectCardProps {
  project: ProjectSummary;
  onClick: () => void;
  onDelete?: (id: string) => void;
  showOwner?: boolean;
}

const BOARD_GRADIENTS: Record<string, string> = {
  ARDUINO_UNO: 'from-blue-500/80 to-cyan-500/80',
  ARDUINO_MEGA: 'from-indigo-500/80 to-blue-500/80',
  ARDUINO_NANO: 'from-sky-500/80 to-blue-400/80',
  ESP32: 'from-emerald-500/80 to-green-500/80',
  ESP32_S3: 'from-teal-500/80 to-emerald-500/80',
  ESP8266: 'from-green-500/80 to-lime-500/80',
};

export default function VfProjectCard({ project, onClick, onDelete, showOwner = false }: VfProjectCardProps) {
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const gradient = BOARD_GRADIENTS[project.boardType] || 'from-slate-700 to-slate-800';

  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
      className="glass group relative overflow-hidden rounded-2xl p-5 border border-slate-200 dark:border-white/5 cursor-pointer bg-white/70 dark:bg-slate-900/40 backdrop-blur-md shadow-sm hover:shadow-xl hover:border-volt-500/20 dark:hover:border-white/10 transition-all duration-300"
    >
      {/* Background ambient glow on hover */}
      <div className={`absolute -inset-20 bg-gradient-to-br ${gradient} opacity-0 group-hover:opacity-5 blur-3xl pointer-events-none transition-all duration-500`} />

      {/* Delete/More Options context menu */}
      {onDelete && (
        <div className="absolute top-4 right-4 z-10" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-lg bg-white/80 text-slate-500 hover:text-slate-950 hover:bg-slate-100 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-700"
            title={t('Options')}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          <AnimatePresence>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: -5, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -5, scale: 0.95 }}
                  className="absolute right-0 mt-1 w-32 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-xl shadow-xl overflow-hidden z-50"
                >
                  <button
                    onClick={() => {
                      setConfirmOpen(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-xs text-red-500 hover:bg-red-500/10 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> {t('Delete')}
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Card Content click trigger */}
      <div onClick={onClick}>
        {/* Card Thumbnail */}
        <div className={`h-32 rounded-xl bg-gradient-to-br ${gradient} mb-4 flex items-center justify-center relative overflow-hidden border border-white/10 shadow-inner opacity-80 group-hover:opacity-100 group-hover:scale-[1.01] transition-all duration-300`}>
          <Cpu className="w-12 h-12 text-white/50 group-hover:rotate-3 transition-all duration-300" />
        </div>

        {/* Title & Description */}
        <h3 className="text-base font-semibold text-slate-950 dark:text-white mb-1 truncate group-hover:text-volt-500 dark:group-hover:text-volt-400 transition-colors">
          {project.name}
        </h3>
        <p className="text-xs text-slate-600 dark:text-slate-400 mb-3 line-clamp-2 min-h-[2.5rem] leading-relaxed">
          {project.description || t('No description')}
        </p>

        {/* Optional Owner row */}
        {showOwner && project.owner && (
          <div className="flex items-center gap-2 mb-3 border-t border-slate-100 dark:border-white/[0.04] pt-2.5">
            <div className="w-5 h-5 rounded-full bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center text-[8px] font-bold text-white shadow-sm">
              {project.owner.displayName?.charAt(0).toUpperCase() || '?'}
            </div>
            <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
              {project.owner.displayName || project.owner.username}
            </span>
          </div>
        )}

        {/* Meta Stats row */}
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-500">
          <span className="flex items-center gap-1"><Eye className="w-3.5 h-3.5" /> {project.viewCount}</span>
          <span className="flex items-center gap-1"><GitFork className="w-3.5 h-3.5" /> {project.forkCount}</span>
          <span className="flex items-center gap-1 ml-auto"><Clock className="w-3.5 h-3.5" /> {new Date(project.updatedAt).toLocaleDateString()}</span>
        </div>

        {/* Badges row */}
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          <VfBadge variant="secondary">
            {project.boardType.replace(/_/g, ' ')}
          </VfBadge>
          <VfBadge
            variant={project.isPublic ? 'primary' : 'secondary'}
            icon={project.isPublic ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
          >
            {project.isPublic ? t('Public') : t('Private')}
          </VfBadge>
        </div>
      </div>
      {onDelete && (
        <VfConfirmDialog
          isOpen={confirmOpen}
          onClose={() => setConfirmOpen(false)}
          onConfirm={() => onDelete(project.id)}
          title={t('Delete Project')}
          message={t('Are you sure you want to delete this project? This action cannot be undone.')}
          isDestructive={true}
        />
      )}
    </motion.div>
  );
}
