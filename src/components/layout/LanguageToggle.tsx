import React from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { Globe } from 'lucide-react';
import { cn } from '@/utils';

export interface LanguageToggleProps {
  className?: string;
  variant?: 'button' | 'dropdown';
}

export const LanguageToggle: React.FC<LanguageToggleProps> = ({ className }) => {
  const { language, toggleLanguage, setLanguage } = useLanguage();

  return (
    <div className={cn('inline-flex items-center rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 p-0.5 text-xs font-medium', className)}>
      <button
        type="button"
        onClick={() => setLanguage('en')}
        className={cn(
          'px-2 py-1 rounded transition-all select-none',
          language === 'en'
            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-semibold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        )}
        aria-label="Switch to English"
        aria-pressed={language === 'en'}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage('bn')}
        className={cn(
          'px-2 py-1 rounded transition-all select-none font-bengali',
          language === 'bn'
            ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs font-semibold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
        )}
        aria-label="বাংলা ভাষায় পরিবর্তন করুন"
        aria-pressed={language === 'bn'}
      >
        বাং
      </button>
    </div>
  );
};

export default LanguageToggle;
