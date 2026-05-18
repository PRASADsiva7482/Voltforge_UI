import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Globe, Sun, Moon, Menu, Bell, User, X, LayoutDashboard, FolderOpen, Cpu, Settings, Shield, LogOut, BellOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useThemeStore } from '../../store/themeStore';
import { useAuthStore } from '../../store/authStore';
import keycloak from '../../utils/keycloak';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation, Link } from 'react-router-dom';

// ── Placeholder notifications ──
const INITIAL_NOTIFICATIONS = [
  { id: '1', title: 'Project "LED Matrix" saved', time: '2 min ago', read: false },
  { id: '2', title: 'New community template available', time: '1 hr ago', read: false },
  { id: '3', title: 'Simulation completed successfully', time: '3 hrs ago', read: true },
];

export default function Navbar() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useThemeStore();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();

  const [isLangOpen, setIsLangOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifications, setNotifications] = useState(INITIAL_NOTIFICATIONS);

  // Refs for click-outside handling
  const langRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // ── Click-outside handler ──
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setIsLangOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setIsProfileOpen(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setIsNotifOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ── Close mobile menu on route change ──
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

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

  // ── Search handler ──
  const handleSearch = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed) {
      navigate(`/explore?q=${encodeURIComponent(trimmed)}`);
    }
  }, [searchQuery, navigate]);

  // ── Mark all notifications as read when opening ──
  const toggleNotifications = () => {
    if (!isNotifOpen) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
    setIsNotifOpen(!isNotifOpen);
  };

  const clearNotifications = () => {
    setNotifications([]);
  };

  const languages = [
    { code: 'en', label: 'English' },
    { code: 'hi', label: 'हिन्दी (Hindi)' },
    { code: 'te', label: 'తెలుగు (Telugu)' },
    { code: 'ta', label: 'தமிழ் (Tamil)' },
    { code: 'kn', label: 'ಕನ್ನಡ (Kannada)' },
    { code: 'ml', label: 'മലയാളം (Malayalam)' },
    { code: 'mr', label: 'मराठी (Marathi)' },
  ];

  const isAdmin = user?.role === 'ADMIN';

  const displayName = user?.displayName || user?.username || keycloak.tokenParsed?.name || keycloak.tokenParsed?.preferred_username || user?.email || '';

  const mobileNavItems = [
    { icon: LayoutDashboard, label: t('Dashboard'), path: '/dashboard' },
    { icon: FolderOpen, label: t('My Projects'), path: '/projects' },
    { icon: Cpu, label: t('Explore'), path: '/explore' },
    { icon: Settings, label: t('Settings'), path: '/settings' },
    ...(isAdmin ? [{ icon: Shield, label: t('Admin'), path: '/admin' }] : []),
  ];

  const iconButtonBase = 'p-2.5 rounded-xl border transition-all bloom-hover';
  const iconButtonIdle = 'bg-white/70 border-surface-200 text-surface-600 hover:bg-surface-100 hover:text-surface-950 hover:border-surface-300 dark:bg-surface-800/50 dark:border-surface-700/50 dark:text-surface-300 dark:hover:text-white dark:hover:bg-surface-700 dark:hover:border-surface-600';
  const iconButtonActive = 'bg-white border-volt-500/30 text-surface-950 dark:bg-surface-700 dark:border-surface-600 dark:text-white';
  const dropdownPanel = 'absolute right-0 mt-3 bg-white border border-surface-200 rounded-xl shadow-2xl overflow-hidden z-50 dark:bg-surface-900 dark:border-surface-700';
  const dropdownItem = 'text-surface-700 hover:bg-surface-100 hover:text-surface-950 border-l-2 border-transparent dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-white';
  const searchInputClass = 'w-full pl-10 pr-4 py-2 bg-white/80 border border-surface-200 rounded-xl text-sm text-surface-950 placeholder-surface-500 focus:outline-none focus:ring-2 focus:ring-volt-500/50 focus:border-volt-500/40 transition-all dark:bg-white/5 dark:border-white/10 dark:text-white dark:placeholder-surface-400 dark:focus:border-volt-500/30';

  // ── Dropdown animation variants ──
  const dropdownVariants = {
    hidden: { opacity: 0, y: 8, scale: 0.95 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.18, ease: 'easeOut' as const } },
    exit: { opacity: 0, y: 8, scale: 0.95, transition: { duration: 0.12, ease: 'easeIn' as const } },
  };

  const mobileMenuVariants = {
    hidden: { x: '100%' },
    visible: { x: 0, transition: { type: 'spring' as const, damping: 28, stiffness: 300 } },
    exit: { x: '100%', transition: { duration: 0.2, ease: 'easeIn' as const } },
  };

  return (
    <>
      <nav className="glass sticky top-0 z-50 border-b border-surface-200/70 px-5 lg:px-8 py-3 flex items-center justify-between dark:border-white/5">
        {/* Left side: Search */}
        <div className="flex items-center flex-1">
          <form onSubmit={handleSearch} className="hidden md:flex relative max-w-md w-full ml-4">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="w-4 h-4 text-surface-400" />
            </div>
            <input
              id="global-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('Search projects...')}
              className={searchInputClass}
            />
          </form>
        </div>

        {/* Right side: Actions */}
        <div className="flex items-center gap-3">
          {/* Language Switcher */}
          <div className="relative" ref={langRef}>
            <button
              id="lang-switcher"
              onClick={() => setIsLangOpen(!isLangOpen)}
              className={`${iconButtonBase} ${isLangOpen ? iconButtonActive : iconButtonIdle}`}
              title="Language"
            >
              <Globe className="w-4 h-4" />
            </button>

            <AnimatePresence>
              {isLangOpen && (
                <motion.div
                  variants={dropdownVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={`${dropdownPanel} w-40`}
                >
                  {languages.map((lng) => (
                    <button
                      key={lng.code}
                      onClick={() => changeLanguage(lng.code)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${i18n.language === lng.code
                          ? 'bg-volt-500/20 text-volt-400 border-l-2 border-volt-500'
                          : dropdownItem
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
            id="theme-toggle"
            onClick={toggleTheme}
            className={`${iconButtonBase} ${iconButtonIdle}`}
            title="Toggle Theme"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Notifications Dropdown */}
          <div className="hidden md:block relative" ref={notifRef}>
            <button
              id="notifications-bell"
              onClick={toggleNotifications}
              className={`${iconButtonBase} relative ${isNotifOpen ? iconButtonActive : iconButtonIdle}`}
              title="Notifications"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-forge-500 rounded-full border-2 border-surface-900" />
              )}
            </button>

            <AnimatePresence>
              {isNotifOpen && (
                <motion.div
                  variants={dropdownVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={`${dropdownPanel} w-80`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-surface-800">
                    <h3 className="text-sm font-semibold text-surface-950 dark:text-white">{t('Notifications')}</h3>
                    {notifications.length > 0 && (
                      <button
                        onClick={clearNotifications}
                        className="text-[10px] text-surface-400 hover:text-volt-400 transition-colors font-medium"
                      >
                        {t('Clear all')}
                      </button>
                    )}
                  </div>

                  {/* Notification List */}
                  <div className="max-h-72 overflow-y-auto">
                    {notifications.length === 0 ? (
                       <div className="flex flex-col items-center justify-center py-10 px-4">
                        <BellOff className="w-8 h-8 text-surface-600 mb-3" />
                        <p className="text-sm text-surface-400 font-medium">{t('No new notifications')}</p>
                        <p className="text-xs text-surface-500 mt-1">{t("You're all caught up!")}</p>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className="px-4 py-3 hover:bg-surface-100 transition-colors border-b border-surface-200 last:border-b-0 cursor-pointer dark:hover:bg-surface-800 dark:border-surface-800"
                        >
                          <div className="flex items-start gap-3">
                            <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${notif.read ? 'bg-surface-600' : 'bg-volt-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-surface-950 font-medium leading-relaxed dark:text-white">{notif.title}</p>
                              <p className="text-[10px] text-surface-500 mt-0.5">{notif.time}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="h-6 w-px bg-surface-200 mx-2 hidden md:block dark:bg-surface-800"></div>

          {/* Profile Dropdown */}
          <div className="relative hidden md:block" ref={profileRef}>
            <button
              id="profile-dropdown"
              onClick={() => setIsProfileOpen(!isProfileOpen)}
              className={`flex items-center gap-2 p-1.5 pr-4 pl-1.5 rounded-xl border transition-all bloom-hover ${isProfileOpen ? 'bg-white border-volt-500/30 dark:bg-surface-700 dark:border-surface-600' : 'bg-white/70 border-surface-200 hover:bg-surface-100 hover:border-surface-300 dark:bg-surface-800/50 dark:border-surface-700/50 dark:hover:bg-surface-700 dark:hover:border-surface-600'}`}
            >
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center text-xs font-bold text-white shadow-lg">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <span className="text-sm font-medium text-surface-800 dark:text-surface-200">{displayName}</span>
            </button>

            <AnimatePresence>
              {isProfileOpen && (
                <motion.div
                  variants={dropdownVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className={`${dropdownPanel} w-56`}
                >
                  <div className="px-4 py-3 border-b border-surface-800">
                    <p className="text-sm font-medium text-surface-950 dark:text-white">{displayName}</p>
                    <p className="text-xs text-surface-400 truncate">{user?.email || keycloak.tokenParsed?.email}</p>
                  </div>
                  <div className="py-1 border-b border-surface-800">
                    <button onClick={() => navigate('/settings')} className="w-full text-left px-4 py-2 text-sm text-surface-700 hover:bg-surface-100 hover:text-surface-950 transition-colors flex items-center gap-2 dark:text-surface-300 dark:hover:bg-surface-800 dark:hover:text-white">
                      <User className="w-4 h-4" /> {t('Settings')}
                    </button>
                  </div>
                  <div className="py-1">
                    <button onClick={handleLogout} className="w-full text-left px-4 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors">
                      {t('Logout')}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Mobile menu toggle */}
          <button
            id="mobile-menu-toggle"
            className="md:hidden p-2 rounded-xl text-surface-500 hover:text-surface-950 hover:bg-surface-100 transition-colors dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5"
            onClick={() => setIsMobileMenuOpen(true)}
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </nav>

      {/* ── Mobile Menu Overlay ── */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
              onClick={() => setIsMobileMenuOpen(false)}
            />

            {/* Slide-out Panel */}
            <motion.div
              variants={mobileMenuVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="fixed top-0 right-0 bottom-0 w-[300px] max-w-[85vw] glass border-l border-surface-200 z-[70] flex flex-col overflow-y-auto dark:border-white/10"
            >
              {/* Mobile Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-surface-200/70 dark:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-volt-500 to-forge-500 flex items-center justify-center text-sm font-bold text-white shadow-lg">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-surface-950 truncate dark:text-white">{displayName}</p>
                    <p className="text-[10px] text-surface-400 truncate">{user?.email || keycloak.tokenParsed?.email}</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-2 rounded-xl text-surface-500 hover:text-surface-950 hover:bg-surface-100 transition-colors dark:text-surface-400 dark:hover:text-white dark:hover:bg-white/5"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Search */}
              <div className="px-5 py-4 border-b border-surface-200/70 dark:border-white/5">
                <form onSubmit={(e) => { handleSearch(e); setIsMobileMenuOpen(false); }}>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Search className="w-4 h-4 text-surface-400" />
                    </div>
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t('Search projects...')}
                      className={`${searchInputClass} py-2.5`}
                    />
                  </div>
                </form>
              </div>

              {/* Navigation Links */}
              <nav className="flex-1 p-4 space-y-1">
                {mobileNavItems.map((item) => {
                  const isActive = location.pathname.startsWith(item.path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-4 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200
                        ${isActive
                          ? 'bg-volt-500/10 text-volt-400 border border-volt-500/20 shadow-[0_0_14px_rgba(34,197,94,0.12)]'
                          : 'text-surface-600 hover:bg-surface-100 hover:text-surface-950 border border-transparent dark:text-surface-300 dark:hover:bg-white/5 dark:hover:text-white'
                        }`}
                    >
                      <Icon className={`w-5 h-5 ${isActive ? 'text-volt-400' : 'text-surface-500'}`} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* Mobile Footer Actions */}
              <div className="p-4 border-t border-surface-200/70 space-y-2 dark:border-white/5">
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-sm font-medium text-surface-600 hover:bg-surface-100 hover:text-surface-950 transition-colors dark:text-surface-300 dark:hover:bg-white/5 dark:hover:text-white"
                >
                  {theme === 'dark' ? <Sun className="w-5 h-5 text-surface-500" /> : <Moon className="w-5 h-5 text-surface-500" />}
                  {theme === 'dark' ? t('Light Mode') : t('Dark Mode')}
                </button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-4 w-full px-4 py-3 rounded-xl text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-5 h-5" />
                  {t('Logout')}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
