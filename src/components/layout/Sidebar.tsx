import React, { useEffect } from 'react';
import { NavLink, Link, useLocation } from 'react-router-dom';
import { ADMIN_NAVIGATION_ITEMS, getFirstAccessibleRoute } from '@/routes/routes.config';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { Shield, ChevronRight, X, Sparkles, ShieldAlert } from 'lucide-react';
import { cn } from '@/utils';

export interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen = false,
  onClose,
  isCollapsed = false,
}) => {
  const { t, language } = useLanguage();
  const { hasPermission, isBootstrapMode } = useAuth();
  const location = useLocation();

  // Primary accessible landing route for the brand logo
  const brandRoute = getFirstAccessibleRoute(hasPermission, isBootstrapMode);

  // Filter navigation items by strictly assigned permissions
  const accessibleNavItems = ADMIN_NAVIGATION_ITEMS.filter((item) => {
    if (!item.requiredPermission) return true;
    return hasPermission(item.requiredPermission);
  });

  // Close mobile sidebar on route change
  useEffect(() => {
    if (onClose) {
      onClose();
    }
  }, [location.pathname]);

  // Handle ESC key to dismiss mobile sidebar
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && onClose) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 z-40 bg-slate-900/60 dark:bg-black/75 lg:hidden backdrop-blur-xs transition-opacity duration-200"
          aria-hidden="true"
        />
      )}

      {/* Main Sidebar Element */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex flex-col bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 transition-all duration-200 ease-in-out',
          // Desktop fixed styling
          'lg:translate-x-0',
          isCollapsed ? 'lg:w-20' : 'lg:w-64',
          // Mobile responsive drawer
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'w-64 max-w-[80vw]'
        )}
        aria-label="Admin Navigation"
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <Link
            to={brandRoute}
            className="flex items-center gap-3 overflow-hidden group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 rounded-lg p-1 -m-1"
          >
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-sky-600 to-sky-700 dark:from-sky-500 dark:to-sky-600 flex items-center justify-center text-white shadow-sm shrink-0 group-hover:scale-105 transition-transform duration-150">
              <Shield className="w-5 h-5" />
            </div>
            {!isCollapsed && (
              <div className="flex flex-col truncate">
                <span className="font-bold text-sm text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
                  Sobai Ke Janao
                </span>
                <span className="text-[10px] uppercase font-semibold text-sky-600 dark:text-sky-400 tracking-wider">
                  Admin Panel
                </span>
              </div>
            )}
          </Link>

          {/* Close button on mobile */}
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Items List */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {!isCollapsed && (
            <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              {language === 'bn' ? 'কার্যক্রম' : 'Operations'}
            </div>
          )}

          {accessibleNavItems.length === 0 ? (
            !isCollapsed ? (
              <div className="px-3 py-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 text-center">
                <ShieldAlert className="w-5 h-5 text-amber-500 mx-auto mb-1.5" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  {language === 'bn' ? 'কোনো মডিউলে প্রবেশাধিকার নেই' : 'No Accessible Modules'}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1">
                  {language === 'bn' ? 'অনুমতির জন্য প্রশাসকের সাথে যোগাযোগ করুন' : 'Contact system admin for role assignment'}
                </p>
              </div>
            ) : null
          ) : (
            accessibleNavItems.map((item) => {
              const Icon = item.icon;
              const label = t.nav[item.labelKey] || item.defaultLabel;

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(
                      'group flex items-center justify-between px-3 py-2.5 rounded-md text-xs font-medium transition-all duration-150 select-none relative',
                      isActive
                        ? 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 font-semibold shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100',
                      isCollapsed ? 'justify-center px-2' : ''
                    )
                  }
                  title={isCollapsed ? label : undefined}
                >
                  {({ isActive }) => (
                    <>
                      <div className="flex items-center gap-3 min-w-0">
                        <Icon
                          className={cn(
                            'w-4 h-4 shrink-0 transition-colors',
                            isActive
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-slate-400 dark:text-slate-500 group-hover:text-slate-600 dark:group-hover:text-slate-300'
                          )}
                        />
                        {!isCollapsed && <span className="truncate">{label}</span>}
                      </div>

                      {!isCollapsed && isActive && (
                        <div className="flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-sky-600 dark:bg-sky-400" />
                          <ChevronRight className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 opacity-60" />
                        </div>
                      )}

                      {/* Active Accent Bar */}
                      {isActive && (
                        <div className="absolute left-0 top-1 bottom-1 w-1 bg-sky-600 dark:bg-sky-400 rounded-r" />
                      )}
                    </>
                  )}
                </NavLink>
              );
            })
          )}
        </nav>

        {/* Sidebar Footer */}
        <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 shrink-0">
          {!isCollapsed ? (
            <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 px-2">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{t.header.operational}</span>
              </div>
              <span className="font-mono text-[10px]">v1.2.0</span>
            </div>
          ) : (
            <div className="flex justify-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500" title="System Operational" />
            </div>
          )}
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
