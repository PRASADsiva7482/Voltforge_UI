import VfButton from './VfButton';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface VfPaginationProps {
  page: number; // 0-indexed
  totalPages: number;
  onPageChange: (newPage: number) => void;
}

export default function VfPagination({ page, totalPages, onPageChange }: VfPaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className="flex justify-center items-center gap-3 mt-12">
      <VfButton
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(Math.max(0, page - 1))}
        disabled={page === 0}
        icon={<ChevronLeft className="w-3.5 h-3.5" />}
      >
        {t('Previous')}
      </VfButton>
      
      <div className="flex items-center gap-1.5 px-3 py-1.5 glass rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 border border-slate-200/50 dark:border-white/5">
        <span>{t('Page')}</span>
        <span className="text-volt-500 font-bold dark:text-volt-400">{page + 1}</span>
        <span className="text-slate-400">/</span>
        <span>{totalPages}</span>
      </div>

      <VfButton
        variant="secondary"
        size="sm"
        onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
        disabled={page >= totalPages - 1}
        icon={<ChevronRight className="w-3.5 h-3.5" />}
        iconPosition="right"
      >
        {t('Next')}
      </VfButton>
    </div>
  );
}
