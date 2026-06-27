import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Shield, Save, Check, Calendar } from 'lucide-react';
import VfButton from '../../components/ui/VfButton';
import VfPageHeader from '../../components/ui/VfPageHeader';
import VfAvatar from '../../components/ui/VfAvatar';
import VfBadge from '../../components/ui/VfBadge';
import VfFormField from '../../components/ui/VfFormField';
import VfTextarea from '../../components/ui/VfTextarea';
import VfInput from '../../components/ui/VfInput';
import { useMutation } from '@tanstack/react-query';
import { userApi } from '../../api/services';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setAvatarUrl(user.avatarUrl || '');
    }
  }, [user]);

  const updateMutation = useMutation({
    mutationFn: () => userApi.updateProfile({ displayName, bio, avatarUrl: avatarUrl || undefined }),
    onSuccess: (res) => {
      setUser(res.data.data);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  return (
    <div className="p-8 max-w-4xl mx-auto pt-10 pb-24">
      {/* Header */}
      <VfPageHeader
        title={t('Settings')}
        description={t('Manage your profile and preferences')}
      />

      {/* Profile Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-8 mb-10"
      >
        <div className="flex items-center gap-3 mb-8">
          <User className="w-5 h-5 text-volt-400" />
          <h2 className="text-lg font-semibold text-surface-950 dark:text-white">{t('Profile')}</h2>
        </div>

        {/* Avatar Preview */}
        <div className="flex items-center gap-6 mb-8">
          <VfAvatar src={avatarUrl} name={displayName || user?.username || ''} size="lg" />
          <div>
            <h3 className="text-lg font-semibold text-surface-950 dark:text-white">{displayName || user?.username}</h3>
            <p className="text-sm text-surface-600 dark:text-surface-400">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <VfBadge variant="secondary">
                {user?.role}
              </VfBadge>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <VfFormField label={t('Display Name')} htmlFor="settings-display-name">
            <VfInput
              id="settings-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </VfFormField>

          <VfFormField label={t('Bio')} htmlFor="settings-bio">
            <VfTextarea
              id="settings-bio"
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder={t('Tell us about yourself...')}
              rows={3}
            />
          </VfFormField>

          <VfFormField label={t('Avatar URL')} htmlFor="settings-avatar-url">
            <VfInput
              id="settings-avatar-url"
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
            />
          </VfFormField>
        </div>

        <div className="flex justify-end mt-10">
          <VfButton variant="primary" size="md"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            loading={updateMutation.isPending}
            icon={saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}>
            {saved ? 'Saved!' : updateMutation.isPending ? 'Saving...' : 'Save Changes'}
          </VfButton>
        </div>
      </motion.div>

      {/* Account Info (read-only) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-2xl p-8 mb-10"
      >
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-5 h-5 text-forge-400" />
          <h2 className="text-lg font-semibold text-surface-950 dark:text-white">{t('Account')}</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-surface-200/70 dark:border-white/5">
            <div className="flex items-center gap-3">
              <Mail className="w-4 h-4 text-surface-400" />
              <span className="text-sm text-surface-700 dark:text-surface-300">Email</span>
            </div>
            <span className="text-sm text-surface-950 dark:text-white">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-surface-200/70 dark:border-white/5">
            <div className="flex items-center gap-3">
              <User className="w-4 h-4 text-surface-400" />
              <span className="text-sm text-surface-700 dark:text-surface-300">Username</span>
            </div>
            <span className="text-sm text-surface-950 dark:text-white">{user?.username}</span>
          </div>
          <div className="flex items-center justify-between py-3 border-b border-surface-200/70 dark:border-white/5">
            <div className="flex items-center gap-3">
              <Shield className="w-4 h-4 text-surface-400" />
              <span className="text-sm text-surface-700 dark:text-surface-300">Role</span>
            </div>
            <span className="text-sm text-surface-950 dark:text-white">{user?.role}</span>
          </div>
          <div className="flex items-center justify-between py-3">
            <div className="flex items-center gap-3">
              <Calendar className="w-4 h-4 text-surface-400" />
              <span className="text-sm text-surface-700 dark:text-surface-300">Member since</span>
            </div>
            <span className="text-sm text-surface-950 dark:text-white">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
