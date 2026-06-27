import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Cpu, Zap, Wifi, ChevronRight } from 'lucide-react';
import VfButton from '../../components/ui/VfButton';
import VfPageHeader from '../../components/ui/VfPageHeader';
import VfSwitch from '../../components/ui/VfSwitch';
import VfFormField from '../../components/ui/VfFormField';
import VfTextarea from '../../components/ui/VfTextarea';
import VfInput from '../../components/ui/VfInput';
import VfBreadcrumbs from '../../components/ui/VfBreadcrumbs';
import VfSelectableCard from '../../components/ui/VfSelectableCard';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { projectApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import { useToastStore } from '../../store/useToastStore';
import { generateDefaultCode } from '../../utils/codeTemplates';
import type { BoardType, CreateProjectRequest } from '../../types';

const MAX_NAME_LENGTH = 50;
const MAX_DESCRIPTION_LENGTH = 500;

const boards: { type: BoardType; name: string; description: string; icon: typeof Cpu; gradient: string }[] = [
  { type: 'ARDUINO_UNO', name: 'Arduino Uno', description: 'Classic 8-bit ATmega328P board — great for beginners', icon: Cpu, gradient: 'from-blue-500 to-cyan-500' },
  { type: 'ARDUINO_MEGA', name: 'Arduino Mega', description: '54 digital pins, 16 analog — for complex projects', icon: Cpu, gradient: 'from-indigo-500 to-blue-500' },
  { type: 'ARDUINO_NANO', name: 'Arduino Nano', description: 'Compact breadboard-friendly board', icon: Cpu, gradient: 'from-sky-500 to-blue-400' },
  { type: 'ESP32', name: 'ESP32', description: 'Dual-core 240MHz + WiFi + Bluetooth — IoT powerhouse', icon: Wifi, gradient: 'from-emerald-500 to-green-500' },
  { type: 'ESP32_S3', name: 'ESP32-S3', description: 'ESP32 with USB OTG & vector extensions', icon: Wifi, gradient: 'from-teal-500 to-emerald-500' },
  { type: 'ESP8266', name: 'ESP8266', description: 'Budget WiFi-enabled microcontroller', icon: Wifi, gradient: 'from-green-500 to-lime-500' },
];

/** Parse comma-separated tags: trims whitespace and removes empty entries. */
function parseTags(raw: string): string | undefined {
  const parsed = raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
    .join(',');
  return parsed || undefined;
}

export default function NewProjectPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isAi = searchParams.get('ai') === 'true';
  const addToast = useToastStore((s) => s.addToast);

  const [step, setStep] = useState(1);
  const [selectedBoard, setSelectedBoard] = useState<BoardType | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [tags, setTags] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: CreateProjectRequest) => projectApi.create(data),
    onSuccess: (res) => {
      const project = res.data.data;
      navigate(`/editor/${project.id}${isAi ? '?ai=true' : ''}`);
    },
    onError: (error: Error) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        error.message ||
        'Failed to create project. Please try again.';
      addToast(message, 'error');
    },
  });

  const handleCreate = () => {
    if (!selectedBoard || !name.trim()) return;
    createMutation.mutate({
      name: name.trim(),
      description: description.trim() || undefined,
      boardType: selectedBoard,
      isPublic,
      tags: parseTags(tags),
      codeFiles: [
        {
          filename: 'main.ino',
          content: generateDefaultCode(selectedBoard, name.trim()),
          language: 'cpp',
          sortOrder: 0,
        },
      ],
    });
  };

  /** Navigate back safely — falls back to /projects if there is no browser history. */
  const handleBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/projects');
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto pt-8 pb-20">
      {/* Breadcrumbs */}
      <VfBreadcrumbs
        items={[
          { label: t('My Projects'), onClick: () => navigate('/projects') },
          { label: isAi ? t('AI Generate') : t('New Project') }
        ]}
      />
      <div className="mt-4" />

      {/* Header */}
      <VfPageHeader
        title={isAi ? t('AI Generate Project') : t('New Project')}
        description={isAi ? t('Let AI create a circuit for you') : t('Set up your new circuit project')}
        icon={<Zap className="w-5 h-5 text-white" />}
        onBackClick={handleBack}
      />

      {/* Step 1: Select Board */}
      {step === 1 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-lg font-semibold text-surface-950 mb-1 dark:text-white">{t('Choose Your Board')}</h2>
          <p className="text-surface-600 text-sm mb-6 dark:text-surface-400">{t('Select the microcontroller for your project')}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {boards.map((board) => {
              const Icon = board.icon;
              const selected = selectedBoard === board.type;
              return (
                <VfSelectableCard
                  key={board.type}
                  selected={selected}
                  onSelect={() => setSelectedBoard(board.type)}
                  title={t(board.name)}
                  description={t(board.description)}
                  icon={<Icon className="w-6 h-6 text-white" />}
                  iconGradient={board.gradient}
                />
              );
            })}
          </div>
          <div className="flex justify-end mt-10">
            <VfButton variant="primary" size="md" onClick={() => setStep(2)}
              disabled={!selectedBoard}
              icon={<ChevronRight className="w-4 h-4" />} iconPosition="right">
              {t('Continue')}
            </VfButton>
          </div>
        </motion.div>
      )}

      {/* Step 2: Project Details */}
      {step === 2 && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
          <h2 className="text-lg font-semibold text-surface-950 mb-1 dark:text-white">{t('Project Details')}</h2>
          <p className="text-surface-600 text-sm mb-6 dark:text-surface-400">{t('Give your project a name and description')}</p>

          <div className="space-y-5">
            <VfFormField
              label={t('Project Name *')}
              htmlFor="project-name"
              characterCount={`${name.length}/${MAX_NAME_LENGTH}`}
            >
              <VfInput
                id="project-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                maxLength={MAX_NAME_LENGTH}
                placeholder={t('e.g., Smart Home Controller')}
                aria-required="true"
                autoFocus
              />
            </VfFormField>

            <VfFormField
              label={t('Description')}
              htmlFor="project-description"
              characterCount={`${description.length}/${MAX_DESCRIPTION_LENGTH}`}
            >
              <VfTextarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION_LENGTH))}
                maxLength={MAX_DESCRIPTION_LENGTH}
                placeholder={t('Describe your circuit project...')}
                rows={3}
              />
            </VfFormField>

            <VfFormField label={t('Tags')} htmlFor="project-tags">
              <VfInput
                id="project-tags"
                type="text"
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder={t('e.g., iot, sensor, led (comma-separated)')}
              />
            </VfFormField>

            <VfSwitch
              checked={isPublic}
              onChange={setIsPublic}
              label={isPublic ? t('Public — visible to everyone') : t('Private — only you can see this')}
            />
          </div>

          <div className="flex justify-between mt-10">
            <VfButton variant="ghost" size="md" onClick={() => setStep(1)}>
              {t('← Back')}
            </VfButton>
            <VfButton variant="primary" size="md"
              onClick={handleCreate}
              disabled={!name.trim() || createMutation.isPending}
              loading={createMutation.isPending}
              icon={<ChevronRight className="w-4 h-4" />} iconPosition="right">
              {createMutation.isPending ? t('Creating...') : isAi ? t('Create & Generate with AI') : t('Create Project')}
            </VfButton>
          </div>
        </motion.div>
      )}
    </div>
  );
}
