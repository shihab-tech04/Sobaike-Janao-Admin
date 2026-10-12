import React, { ReactNode } from 'react';

export interface PageContainerProps {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export const PageContainer: React.FC<PageContainerProps> = ({
  title,
  subtitle,
  actions,
  children,
  className = '',
}) => {
  return (
    <div className={`p-6 max-w-7xl mx-auto space-y-6 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            {title && (
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>
            )}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div>{children}</div>
    </div>
  );
};

export default PageContainer;
