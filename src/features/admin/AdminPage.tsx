import { motion } from 'framer-motion';
import { Users, FolderOpen, TrendingUp, UserPlus, Activity, BarChart3, Shield } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { adminApi } from '../../api/services';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../../store/authStore';
import { useNavigate } from 'react-router-dom';
import VfPageHeader from '../../components/ui/VfPageHeader';
import VfCardSkeleton from '../../components/ui/VfCardSkeleton';
import { useEffect } from 'react';

export default function AdminPage() {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  // Guard: Only admins
  useEffect(() => {
    if (user && user.role !== 'ADMIN') navigate('/dashboard');
  }, [user, navigate]);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const res = await adminApi.getDashboardStats();
      return res.data.data;
    },
  });

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers || 0, icon: Users, gradient: 'from-blue-500 to-cyan-500', glow: 'rgba(59,130,246,0.15)' },
    { label: 'Active Users', value: stats?.activeUsers || 0, icon: Activity, gradient: 'from-volt-500 to-volt-600', glow: 'rgba(34,197,94,0.15)' },
    { label: 'New Today', value: stats?.newUsersToday || 0, icon: UserPlus, gradient: 'from-purple-500 to-pink-500', glow: 'rgba(168,85,247,0.15)' },
    { label: 'Total Projects', value: stats?.totalProjects || 0, icon: FolderOpen, gradient: 'from-forge-500 to-forge-600', glow: 'rgba(234,179,8,0.15)' },
    { label: 'Public Projects', value: stats?.publicProjects || 0, icon: TrendingUp, gradient: 'from-emerald-500 to-green-500', glow: 'rgba(16,185,129,0.15)' },
    { label: 'New Projects Today', value: stats?.newProjectsToday || 0, icon: BarChart3, gradient: 'from-orange-500 to-red-500', glow: 'rgba(249,115,22,0.15)' },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto pt-10 pb-24">
      {/* Header */}
      <VfPageHeader
        title={t('Admin Dashboard')}
        description={t('Platform overview and management')}
        icon={<Shield className="w-5 h-5 text-white" />}
        iconGradient="from-red-500 to-pink-500"
      />

      {/* Stats Grid */}
      {isLoading ? (
        <VfCardSkeleton count={6} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-10">
          {statCards.map((stat, index) => {
            const Icon = stat.icon;
            return (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.06 }}
                className="glass rounded-2xl p-6 group hover:border-volt-500/20 transition-all dark:hover:border-white/10"
                style={{ boxShadow: `0 0 30px ${stat.glow}` }}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-surface-600 mb-1 dark:text-surface-400">{stat.label}</p>
                    <p className="text-3xl font-bold text-surface-950 dark:text-white">{stat.value.toLocaleString()}</p>
                  </div>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.gradient} flex items-center justify-center opacity-80 group-hover:opacity-100 transition-opacity`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Distribution Section */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="max-w-2xl mx-auto"
        >
          {/* Role Distribution */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-6">
              <Users className="w-5 h-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-surface-950 dark:text-white">User Roles</h2>
            </div>
            <div className="space-y-4">
              {Object.entries(stats.roleBreakdown || {}).map(([role, count]) => {
                const total = Object.values(stats.roleBreakdown || {}).reduce((a, b) => a + b, 0);
                const percentage = total > 0 ? (count / total) * 100 : 0;
                const roleColors: Record<string, string> = {
                  USER: 'bg-blue-500', ADMIN: 'bg-red-500',
                };
                return (
                  <div key={role}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-surface-700 dark:text-surface-300">{role}</span>
                      <span className="text-surface-600 dark:text-surface-400">{count} ({percentage.toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-surface-200 rounded-full overflow-hidden dark:bg-surface-800">
                      <div className={`h-full ${roleColors[role] || 'bg-gray-500'} rounded-full transition-all duration-500`} style={{ width: `${percentage}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
