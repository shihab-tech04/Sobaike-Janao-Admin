import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/utils';

export interface BreadcrumbItem {
  label: string;
  href?: string;
  onClick?: () => void;
}

export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  backButton?: {
    label?: string;
    onClick: () => void;
  };
  actions?: React.ReactNode;
  className?: string;
}

export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  description,
  breadcrumbs,
  backButton,
  actions,
  className,
}) => {
  return (
    <div className={cn('w-full max-w-full min-w-0 flex flex-col gap-3 pb-5 border-b border-slate-200 dark:border-slate-800', className)}>
      {/* Breadcrumbs or Back button */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-xs text-slate-500 dark:text-slate-400 overflow-hidden truncate">
          {breadcrumbs.map((item, index) => {
            const isLast = index === breadcrumbs.length - 1;
            return (
              <React.Fragment key={index}>
                {index > 0 && <span>/</span>}
                {isLast || (!item.href && !item.onClick) ? (
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{item.label}</span>
                ) : (
                  <button
                    type="button"
                    onClick={item.onClick}
                    className="hover:text-slate-900 dark:hover:text-slate-100 hover:underline transition-colors truncate"
                  >
                    {item.label}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </nav>
      )}

      {backButton && (
        <div>
          <button
            type="button"
            onClick={backButton.onClick}
            className="inline-flex items-center text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 gap-1.5 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{backButton.label || 'Back'}</span>
          </button>
        </div>
      )}

      {/* Main Header Row */}
      <div className="w-full min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-2xl break-words">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-3xl leading-relaxed break-words">
              {description}
            </p>
          )}
        </div>

        {actions && <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 shrink-0 max-w-full">{actions}</div>}
      </div>
    </div>
  );
};

export default PageHeader;
