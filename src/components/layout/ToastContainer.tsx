import { AnimatePresence } from 'framer-motion';
import { useToastStore } from '../../store/useToastStore';
import VfToast from '../ui/VfToast';

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore();

  return (
    <div className="fixed top-20 right-6 z-[9999] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <VfToast
            key={toast.id}
            id={toast.id}
            type={toast.type}
            message={toast.message}
            onClose={removeToast}
            duration={4000}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
