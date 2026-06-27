import { AlertTriangle } from 'lucide-react';
import VfModal from './VfModal';
import VfButton from './VfButton';

export interface VfConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

export default function VfConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
}: VfConfirmDialogProps) {
  const footer = (
    <>
      <VfButton variant="ghost" size="xs" onClick={onClose}>
        {cancelText}
      </VfButton>
      <VfButton
        variant={isDestructive ? 'danger' : 'primary'}
        size="xs"
        onClick={() => {
          onConfirm();
          onClose();
        }}
      >
        {confirmText}
      </VfButton>
    </>
  );

  return (
    <VfModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      icon={<AlertTriangle className="w-5 h-5 text-amber-500" />}
      footer={footer}
    >
      <div className="flex flex-col gap-2">
        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
          {message}
        </p>
      </div>
    </VfModal>
  );
}
