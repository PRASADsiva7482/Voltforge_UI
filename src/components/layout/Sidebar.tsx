import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Zap, LayoutDashboard, FolderOpen, Settings, Shield,
  LogOut, Menu, X, ChevronDown, Cpu
} from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import keycloak from '../../utils/keycloak';

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const isAdmin = user?.role === 'ADMIN';

  const navItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard' },
    { icon: FolderOpen, label: 'My Projects', path: '/projects' },
    { icon: Cpu, label: 'Explore', path: '/explore' },
    { icon: Settings, label: 'Settings', path: '/settings' },
  ];

  if (isAdmin) {
    navItems.push({ icon: Shield, label: 'Admin', path: '/admin' });
  }

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
  };

  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 260 }}
      transition={{ duration: 0.2, ease: 'easeInOut' }}
      className="glass flex flex-col border-r border-white/5 h-screen sticky top-0 z-40"
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-white/5">
        <div className="flex items-center justify-center flex-shrink-0">
          <img src="/v-logo.svg" alt="VoltForge Logo" className="w-8 h-8" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="overflow-hidden"
            >
              <h1 className="text-lg font-bold bg-gradient-to-r from-volt-400 to-forge-400 bg-clip-text text-transparent">
                VoltForge
              </h1>
              <p className="text-[10px] text-surface-400 -mt-0.5">Circuit Simulator</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto p-1.5 rounded-lg hover:bg-white/5 text-surface-400 hover:text-white transition-colors"
        >
          {collapsed ? <Menu className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto mt-2">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group
                ${isActive
                  ? 'bg-volt-500/10 text-volt-400 border border-volt-500/20 shadow-[0_0_14px_rgba(34,197,94,0.12)]'
                  : 'text-surface-300 hover:bg-white/5 hover:text-white border border-transparent'
                }`}
            >
              <item.icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-volt-400' : 'text-surface-500 group-hover:text-volt-400'}`} />
              <AnimatePresence>
                {!collapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

    </motion.aside>
  );
}
