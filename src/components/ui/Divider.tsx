import React from 'react';
import { cn } from '@/utils';

export interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}

export const Divider: React.FC<DividerProps> = ({
  className,
  orientation = 'horizontal',
  label,
  children,
  ...props
}) => {
  const content = label || children;

  if (orientation === 'vertical') {
    return (
      <div
        role="separator"
        aria-orientation="vertical"
        className={cn(
          'inline-block self-stretch w-px bg-slate-200 dark:bg-slate-800 min-h-[1em] mx-2',
          className
        )}
        {...props}
      />
    );
  }

  if (content) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        className={cn('relative flex items-center py-2', className)}
        {...props}
      >
        <div className="grow border-t border-slate-200 dark:border-slate-800" />
        <span className="shrink-0 px-3 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {content}
        </span>
        <div className="grow border-t border-slate-200 dark:border-slate-800" />
      </div>
    );
  }

  return (
    <hr
      role="separator"
      className={cn('border-0 border-t border-slate-200 dark:border-slate-800 my-4', className)}
      {...props}
    />
  );
};

export default Divider;
