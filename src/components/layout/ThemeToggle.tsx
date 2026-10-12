import React from 'react';
import { useTheme } from '@/themes';
import { Sun, Moon, Laptop } from 'lucide-react';
import { cn } from '@/utils';

export interface ThemeToggleProps {
  className?: string;
  variant?: 'icon' | 'segmented';
}

export const ThemeToggle: React.FC<ThemeToggleProps> = ({ className, variant = 'icon' }) => {
  const { mode, resolvedTheme, setTheme, toggleTheme } = useTheme();

  if (variant === 'segmented') {
    return (
      <div
        className={cn(
          'inline-flex items-center rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 p-0.5 text-xs',
          className
        )}
      >
        <button
          type="button"
          onClick={() => setTheme('light')}
          className={cn(
            'p-1.5 rounded transition-all select-none flex items-center gap-1 cursor-pointer',
            mode === 'light'
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          )}
          title="Light theme"
          aria-label="Light theme"
        >
          <Sun className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTheme('dark')}
          className={cn(
            'p-1.5 rounded transition-all select-none flex items-center gap-1 cursor-pointer',
            mode === 'dark'
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          )}
          title="Dark theme"
          aria-label="Dark theme"
        >
          <Moon className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setTheme('system')}
          className={cn(
            'p-1.5 rounded transition-all select-none flex items-center gap-1 cursor-pointer',
            mode === 'system'
              ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          )}
          title="System theme"
          aria-label="System theme"
        >
          <Laptop className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className={cn(
        'p-2 rounded-md text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500 cursor-pointer',
        className
      )}
      title={`Switch to ${resolvedTheme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label="Toggle color theme"
    >
      {resolvedTheme === 'dark' ? (
        <Sun className="w-4 h-4 text-amber-400" />
      ) : (
        <Moon className="w-4 h-4 text-slate-600 dark:text-slate-300" />
      )}
    </button>
  );
};

export default ThemeToggle;
