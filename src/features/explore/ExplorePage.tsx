import { useState } from 'react';
import { motion } from 'framer-motion';
import { Cpu, Filter, TrendingUp, Search } from 'lucide-react';
import VfButton from '../../components/ui/VfButton';
import VfPageHeader from '../../components/ui/VfPageHeader';
import VfSearchInput from '../../components/ui/VfSearchInput';
import VfSegmentedControl from '../../components/ui/VfSegmentedControl';
import VfProjectGrid from '../../components/ui/VfProjectGrid';
import VfEmptyState from '../../components/ui/VfEmptyState';
import VfPagination from '../../components/ui/VfPagination';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import type { ProjectSummary } from '../../types';

export default function ExplorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
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

  const filterOptions = boardTypes.map((board: string) => ({
    value: board,
    label: board === 'ALL' ? t('All Boards') : board.replace(/_/g, ' '),
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto pt-10 pb-24">
      {/* Header */}
      <VfPageHeader
        title={t('Explore')}
        description={t('Discover amazing circuits built by the community')}
        icon={<TrendingUp className="w-5 h-5 text-white" />}
        iconGradient="from-forge-500 to-forge-600"
      />

      {/* Board Filters and Search Bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="mb-10 flex flex-col md:flex-row gap-4 justify-between items-start md:items-center"
      >
        <div className="flex items-center gap-3 overflow-x-auto pb-1 flex-1">
          <Filter className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <VfSegmentedControl
            options={filterOptions}
            selected={selectedBoard}
            onChange={(val) => {
              setPage(0);
              setSelectedBoard(val);
            }}
          />
        </div>
        <div className="w-full md:w-72">
          <VfSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder={t("Search projects...")}
            hotkey="/"
          />
        </div>
      </motion.div>

      <VfProjectGrid
        projects={filteredProjects}
        isLoading={isLoading}
        skeletonCount={6}
        showOwner={true}
        onProjectClick={(project) => navigate(`/editor/${project.id}`)}
        emptyState={
          <VfEmptyState
            icon={<Search className="w-12 h-12" />}
            title={t('No projects found')}
            description={
              searchQuery
                ? t(`No results for "${searchQuery}". Try different search terms.`, { query: searchQuery })
                : t('Be the first to share a public project!')
            }
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
