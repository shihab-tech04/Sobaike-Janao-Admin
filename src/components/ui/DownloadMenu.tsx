import React, { useState, useRef, useEffect } from 'react';
import { Download, FileSpreadsheet, FileText, ChevronDown, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';

export interface DownloadMenuProps {
  /** Callback to trigger CSV export */
  onExportCsv: () => void | Promise<void>;
  /** Callback to trigger PDF export */
  onExportPdf: () => void | Promise<void>;
  /** Whether an export operation is currently in progress */
  isExporting?: boolean;
  /** Optional temporary feedback/success status message */
  exportMessage?: string | null;
  /** Custom trigger label */
  label?: string;
  /** Visual variant of trigger button */
  variant?: 'primary' | 'secondary' | 'outline';
  /** Size of trigger button */
  size?: 'sm' | 'md' | 'lg';
  /** Disabled state */
  disabled?: boolean;
  /** Alignment of popover menu */
  align?: 'left' | 'right';
  /** Additional CSS class names */
  className?: string;
  /** Optional custom ID for accessibility */
  id?: string;
}

export const DownloadMenu: React.FC<DownloadMenuProps> = ({
  onExportCsv,
  onExportPdf,
  isExporting = false,
  exportMessage = null,
  label,
  variant = 'primary',
  size = 'sm',
  disabled = false,
  align = 'right',
  className = '',
  id = 'download-menu-dropdown',
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const defaultLabel = isBn ? 'এক্সপোর্ট' : 'Export';
  const displayLabel = exportMessage || label || defaultLabel;

  const handleSelectCsv = async () => {
    setIsOpen(false);
    await onExportCsv();
  };

  const handleSelectPdf = async () => {
    setIsOpen(false);
    await onExportPdf();
  };

  // Button size classes
  const sizeClasses = {
    sm: 'h-8 px-3 text-xs gap-1.5',
    md: 'h-9 px-3.5 text-sm gap-2',
    lg: 'h-10 px-4 text-base gap-2.5',
  }[size];

  // Button variant classes
  const variantClasses = {
    primary:
      'bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white font-medium shadow-xs border border-transparent focus-visible:ring-2 focus-visible:ring-cyan-500/40',
    secondary:
      'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/80 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-800 font-medium shadow-2xs focus-visible:ring-2 focus-visible:ring-cyan-500/30',
    outline:
      'bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-medium',
  }[variant];

  return (
    <div ref={menuRef} className={`relative inline-block text-left ${className}`}>
      {/* Trigger Button */}
      <button
        id={id}
        type="button"
        onClick={() => !disabled && !isExporting && setIsOpen((prev) => !prev)}
        disabled={disabled || isExporting}
        aria-haspopup="true"
        aria-expanded={isOpen}
        className={`inline-flex items-center justify-center rounded-lg transition-all select-none cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed ${sizeClasses} ${variantClasses}`}
      >
        {isExporting ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
        ) : (
          <Download className="w-3.5 h-3.5" />
        )}
        <span className="whitespace-nowrap font-medium">{displayLabel}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 transition-transform duration-200 opacity-80 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby={id}
          className={`absolute z-50 mt-1.5 w-64 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-1.5 shadow-xl transition-all animate-in fade-in-0 zoom-in-95 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {/* Menu Section Header */}
          <div className="px-2.5 py-1.5 border-b border-slate-100 dark:border-slate-800/80 mb-1">
            <span className="text-[11px] font-bold tracking-wider uppercase text-slate-400 dark:text-slate-500">
              {isBn ? 'ডাউনলোড ফরম্যাট নির্বাচন' : 'Choose Export Format'}
            </span>
          </div>

          {/* Option 1: CSV Export */}
          <button
            type="button"
            role="menuitem"
            onClick={handleSelectCsv}
            className="w-full group flex items-start gap-2.5 rounded-lg p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
          >
            <div className="p-1.5 rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400 mt-0.5 group-hover:scale-105 transition-transform">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {isBn ? 'সিএসভি স্প্রেডশিট (.CSV)' : 'CSV Spreadsheet (.csv)'}
                </span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-100/60 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                  CSV
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                {isBn
                  ? 'এক্সেল ও স্প্রেডশিটের জন্য সম্পূর্ণ রো ডাটা (UTF-8)'
                  : 'Tabular dataset for Excel & Google Sheets (UTF-8)'}
              </p>
            </div>
          </button>

          {/* Option 2: PDF Export */}
          <button
            type="button"
            role="menuitem"
            onClick={handleSelectPdf}
            className="w-full group flex items-start gap-2.5 rounded-lg p-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer mt-0.5"
          >
            <div className="p-1.5 rounded-md bg-cyan-50 text-cyan-600 dark:bg-cyan-950/50 dark:text-cyan-400 mt-0.5 group-hover:scale-105 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {isBn ? 'ফরম্যাটেড পিডিএফ (.PDF)' : 'Formatted PDF (.pdf)'}
                </span>
                <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-cyan-100/60 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300">
                  PDF
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                {isBn
                  ? 'অফিসিয়াল ও প্রিন্টযোগ্য ডকুমেন্ট (মেটাডাটা ও টেবিলসহ)'
                  : 'Printable report with metadata, KPIs & structured tables'}
              </p>
            </div>
          </button>
        </div>
      )}
    </div>
  );
};
