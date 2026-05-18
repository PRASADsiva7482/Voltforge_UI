import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { User, Mail, Shield, CreditCard, Save, Check } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { userApi, subscriptionApi } from '../../api/services';
import { useAuthStore } from '../../store/authStore';
import { useTranslation } from 'react-i18next';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user, setUser } = useAuthStore();

  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [saved, setSaved] = useState(false);

  const { data: subscriptionData } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const res = await subscriptionApi.getCurrent();
      return res.data.data;
    },
  });

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

  const planColors: Record<string, string> = {
    FREE: 'from-surface-600 to-surface-500',
    PRO: 'from-volt-500 to-forge-500',
    TEAM: 'from-purple-500 to-pink-500',
  };

  return (
    <div className="p-8 max-w-4xl mx-auto pt-8 pb-20">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <h1 className="text-3xl font-bold text-surface-950 mb-2 dark:text-white">{t('Settings')}</h1>
        <p className="text-surface-600 dark:text-surface-400">{t('Manage your profile and preferences')}</p>
      </motion.div>

      {/* Profile Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="glass rounded-2xl p-8 mb-8"
      >
        <div className="flex items-center gap-3 mb-8">
          <User className="w-5 h-5 text-volt-400" />
          <h2 className="text-lg font-semibold text-surface-950 dark:text-white">{t('Profile')}</h2>
        </div>

        {/* Avatar Preview */}
        <div className="flex items-center gap-6 mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center text-2xl font-bold text-white shadow-lg flex-shrink-0">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="w-full h-full rounded-2xl object-cover" />
            ) : (
              displayName?.charAt(0)?.toUpperCase() || user?.username?.charAt(0)?.toUpperCase() || 'U'
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-surface-950 dark:text-white">{displayName || user?.username}</h3>
            <p className="text-sm text-surface-600 dark:text-surface-400">{user?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-gradient-to-r ${planColors[user?.subscriptionType || 'FREE']} text-white`}>
                {user?.subscriptionType || 'FREE'}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-medium bg-surface-100 text-surface-700 border border-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:border-surface-700">
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2 dark:text-surface-300">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2 dark:text-surface-300">Bio</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell us about yourself..."
              rows={3}
              className="w-full px-4 py-3 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all resize-none dark:bg-white/5 dark:border-white/10 dark:text-white"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-2 dark:text-surface-300">Avatar URL</label>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://example.com/avatar.jpg"
              className="w-full px-4 py-3 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white"
            />
          </div>
        </div>

        <div className="flex justify-end mt-8">
          <button
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="vf-btn vf-btn-primary shadow-[0_0_18px_rgba(34,197,94,0.25)] disabled:opacity-50"
          >
            {saved ? <><Check className="w-4 h-4" /> Saved!</> : <><Save className="w-4 h-4" /> {updateMutation.isPending ? 'Saving...' : 'Save Changes'}</>}
          </button>
        </div>
      </motion.div>

      {/* Account Info (read-only) */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="glass rounded-2xl p-8 mb-8"
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
              <CreditCard className="w-4 h-4 text-surface-400" />
              <span className="text-sm text-surface-700 dark:text-surface-300">Member since</span>
            </div>
            <span className="text-sm text-surface-950 dark:text-white">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}</span>
          </div>
        </div>
      </motion.div>

      {/* Subscription Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="glass rounded-2xl p-8"
      >
        <div className="flex items-center gap-3 mb-6">
          <CreditCard className="w-5 h-5 text-purple-400" />
          <h2 className="text-lg font-semibold text-surface-950 dark:text-white">{t('Subscription')}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(['FREE', 'PRO', 'TEAM'] as const).map((plan) => {
            const isActive = (user?.subscriptionType || 'FREE') === plan;
            const features: Record<string, string[]> = {
              FREE: ['5 projects', 'Basic components', 'Community access'],
              PRO: ['Unlimited projects', 'All components', 'AI Assistant', 'Priority support'],
              TEAM: ['Everything in PRO', 'Team collaboration', 'Private sharing', 'Admin dashboard'],
            };
            return (
              <div key={plan} className={`p-7 rounded-xl border transition-all ${isActive ? 'border-volt-500/40 bg-volt-500/5 shadow-[0_0_15px_rgba(34,197,94,0.1)]' : 'border-surface-200 bg-white/50 dark:border-white/5 dark:bg-white/[0.02]'}`}>
                <div className={`inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-gradient-to-r ${planColors[plan]} text-white mb-3`}>
                  {plan}
                </div>
                {isActive && <span className="ml-2 text-xs text-volt-400">Current</span>}
                <ul className="space-y-2 mt-3">
                  {features[plan].map((f) => (
                    <li key={f} className="text-xs text-surface-600 flex items-center gap-2 dark:text-surface-400">
                      <Check className="w-3 h-3 text-volt-500 flex-shrink-0" /> {f}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </motion.div>
    </div>
  );
}
