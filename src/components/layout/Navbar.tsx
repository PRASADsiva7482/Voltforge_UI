import { useState, useEffect } from 'react';
import { Search, Globe, Sun, Moon, Zap, Menu, Bell, User } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import keycloak from '../../utils/keycloak';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();

  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Apply theme class to document
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    }
  }, [theme]);

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    setIsLangOpen(false);
  };

  const handleLogout = () => {
    keycloak.logout({ redirectUri: window.location.origin });
  };

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
  ];

  return (
    <nav className="glass sticky top-0 z-50 border-b border-white/5 px-4 lg:px-8 py-3 flex items-center justify-between">
      {/* Left side: Logo & Search */}
      <div className="flex items-center flex-1">

        <div className="hidden md:flex relative max-w-md w-full ml-4">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-surface-400" />
          </div>
          <input
            type="text"
            placeholder={t('Search projects...')}
            className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-volt-500/50 transition-all"
          />
        </div>
      </div>

      {/* Right side: Actions */}
      <div className="flex items-center gap-2 md:gap-4">
        {/* Language Switcher */}
        <div className="relative">
          <button
            onClick={() => setIsLangOpen(!isLangOpen)}
            className="p-2 rounded-xl text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <Globe className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {isLangOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 mt-2 w-40 glass border border-white/10 rounded-xl shadow-xl overflow-hidden"
              >
                {languages.map((lng) => (
                  <button
                    key={lng.code}
                    onClick={() => changeLanguage(lng.code)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${i18n.language === lng.code
                        ? 'bg-volt-500/20 text-volt-400'
                        : 'text-surface-300 hover:bg-white/5 hover:text-white'
                      }`}
                  >
                    {lng.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 rounded-xl text-surface-400 hover:text-white hover:bg-white/5 transition-colors"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>

        {/* Notifications */}
        <button className="hidden md:flex p-2 rounded-xl text-surface-400 hover:text-white hover:bg-white/5 transition-colors relative">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-forge-500 rounded-full animate-pulse"></span>
        </button>

        <div className="h-6 w-px bg-white/10 mx-1 hidden md:block"></div>

        {/* Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsProfileOpen(!isProfileOpen)}
            className="flex items-center gap-2 p-1 rounded-xl hover:bg-white/5 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center text-xs font-bold text-white shadow-lg">
              {user?.displayName?.charAt(0) || user?.username?.charAt(0) || 'U'}
            </div>
          </button>

          <AnimatePresence>
            {isProfileOpen && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="absolute right-0 mt-2 w-56 glass border border-white/10 rounded-xl shadow-xl overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-white/5">
                  <p className="text-sm font-medium text-white">{user?.displayName || user?.username}</p>
                  <p className="text-xs text-surface-400 truncate">{user?.email}</p>
                </div>
                <div className="py-1 border-b border-white/5">
                  <button onClick={() => navigate('/settings')} className="w-full text-left px-4 py-2 text-sm text-surface-300 hover:bg-white/5 hover:text-white transition-colors flex items-center gap-2">
                    <User className="w-4 h-4" /> {t('Settings')}
                  </button>
                </div>
                <div className="py-1">
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                    Logout
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Mobile menu */}
        <button className="md:hidden p-2 rounded-xl text-surface-400 hover:text-white hover:bg-white/5">
          <Menu className="w-5 h-5" />
        </button>
      </div>
    </nav>
  );
}
