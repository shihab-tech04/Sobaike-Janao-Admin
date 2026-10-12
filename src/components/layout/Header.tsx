import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { ADMIN_NAVIGATION_ITEMS } from '@/routes/routes.config';
import { ThemeToggle } from './ThemeToggle';
import { LanguageToggle } from './LanguageToggle';
import {
  Menu,
  Bell,
  Search,
  User as UserIcon,
  ChevronDown,
  LogOut,
  Shield,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';
import { NotificationDropdown } from './NotificationDropdown';
import { Badge } from '@/components/ui/Badge';
import { cn } from '@/utils';

export interface HeaderProps {
  onToggleSidebar?: () => void;
  isSidebarCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const AdminHeader: React.FC<HeaderProps> = ({
  onToggleSidebar,
}) => {
  const { t, language } = useLanguage();
  const { user, logout, role, isBootstrapMode, isSuperAdmin, hasPermission } = useAuth();
  const isBn = language === 'bn';
  const location = useLocation();
  const navigate = useNavigate();
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);

  const roleTitle = isBootstrapMode
    ? isBn
      ? 'বুটস্ট্র্যাপ অ্যাডমিন'
      : 'Bootstrap Admin'
    : isSuperAdmin
    ? isBn
      ? 'সুপার অ্যাডমিন'
      : 'Super Administrator'
    : role
    ? (isBn && role.name_bn ? role.name_bn : role.name_en)
    : isBn
    ? 'অনুমতিহীন'
    : 'No Role Assigned';

  const handleSignOut = async () => {
    await logout();
    setProfileOpen(false);
    navigate('/login');
  };

  // Compute initials safely from email or metadata
  const userEmail = user?.email || '';
  const userDisplayName =
    (user?.user_metadata?.full_name as string) ||
    (user?.user_metadata?.name as string) ||
    (user?.email ? user.email.split('@')[0] : '') ||
    t.header.operator;
  const userInitials = (
    (user?.user_metadata?.full_name as string) ||
    user?.email?.split('@')[0] ||
    'AD'
  )
    .slice(0, 2)
    .toUpperCase();

  // Determine current active page label
  const currentNav = ADMIN_NAVIGATION_ITEMS.find((item) =>
    location.pathname.startsWith(item.path)
  );
  const currentTitle = currentNav ? t.nav[currentNav.labelKey] : 'Overview';

  // Click outside listener for dropdowns
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <header className="sticky top-0 z-30 h-16 w-full shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between transition-colors">
      {/* Left side: Mobile Toggle & Page Title / Quick Search */}
      <div className="flex items-center gap-3 md:gap-4 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="lg:hidden p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
          aria-label="Open navigation menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Current Context / Breadcrumb indicator */}
        <div className="flex items-center gap-2 min-w-0">
          <span className="hidden sm:inline-block text-xs font-medium text-slate-400 dark:text-slate-500">
            Sobai Ke Janao
          </span>
          <span className="hidden sm:inline-block text-slate-300 dark:text-slate-700">/</span>
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
            {currentTitle}
          </h2>
        </div>

        {/* Quick Search Bar Placeholder */}
        <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800/80 text-slate-400 dark:text-slate-500 text-xs w-64 border border-transparent dark:border-slate-800/60 ml-4 focus-within:border-sky-500 transition-all">
          <Search className="w-3.5 h-3.5" />
          <input
            type="text"
            placeholder={t.header.searchPlaceholder}
            className="bg-transparent border-none outline-none text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 w-full"
            disabled
          />
          <kbd className="hidden sm:inline-block text-[10px] font-mono px-1 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400">
            ⌘K
          </kbd>
        </div>
      </div>

      {/* Right side: Controls (Lang, Theme, Notifs, Profile) */}
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        {/* Language Switcher */}
        <LanguageToggle />

        {/* Theme Mode Toggle */}
        <ThemeToggle />

        {/* Real Notification Bell & Dropdown */}
        <NotificationDropdown />

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-0.5 hidden sm:block" />

        {/* User Profile Dropdown Placeholder */}
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 text-left"
            aria-label="User profile menu"
            aria-expanded={profileOpen}
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-600 to-indigo-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
              {userInitials}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight truncate max-w-[120px]">
                {userDisplayName}
              </div>
              <div className="text-[10px] text-sky-600 dark:text-sky-400 font-medium leading-tight truncate max-w-[120px]">
                {roleTitle}
              </div>
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block ml-0.5" />
          </button>

          {/* Profile Dropdown Menu */}
          {profileOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl py-2 z-50 animate-in fade-in zoom-in-95 text-left">
              <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {userDisplayName}
                </p>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={userEmail}>
                  {userEmail}
                </p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <Badge variant="subtle" size="sm" className="text-[10px] truncate max-w-[180px]">
                    {roleTitle}
                  </Badge>
                </div>
              </div>

              <div className="py-1 text-xs text-slate-700 dark:text-slate-300">
                {hasPermission('roles.manage') && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/roles');
                    }}
                    className="w-full px-4 py-2 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <Shield className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t.nav.roles}</span>
                  </button>
                )}
                {hasPermission('dashboard.view') && (
                  <button
                    type="button"
                    onClick={() => {
                      setProfileOpen(false);
                      navigate('/dashboard');
                    }}
                    className="w-full px-4 py-2 flex items-center gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                    <span>{t.nav.dashboard}</span>
                  </button>
                )}
              </div>

              <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-4 py-2 flex items-center gap-2.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors text-left font-medium"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>{t.header.signOut}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default AdminHeader;
