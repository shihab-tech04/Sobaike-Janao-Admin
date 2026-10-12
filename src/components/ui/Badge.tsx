import React from 'react';
import { cn } from '@/utils';

export type BadgeStatus =
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'pending'
  | 'review'
  | 'approved'
  | 'published'
  | 'resolved'
  | 'rejected'
  | 'default';

export type BadgeVariant = 'subtle' | 'solid' | 'outline';
export type BadgeSize = 'sm' | 'md';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  status?: BadgeStatus;
  variant?: BadgeVariant;
  size?: BadgeSize;
  dot?: boolean;
  children: React.ReactNode;
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  status = 'default',
  variant = 'subtle',
  size = 'md',
  dot = false,
  children,
  ...props
}) => {
  // Subtle styling mapping
  const subtleStyles: Record<BadgeStatus, string> = {
    success:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
    warning:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
    error:
      'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
    info:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50',
    pending:
      'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50',
    review:
      'bg-indigo-50 text-indigo-800 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-900/50',
    approved:
      'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50',
    published:
      'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900/50',
    resolved:
      'bg-teal-50 text-teal-800 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-900/50',
    rejected:
      'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/50',
    default:
      'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
  };

  // Solid styling mapping
  const solidStyles: Record<BadgeStatus, string> = {
    success: 'bg-emerald-600 text-white border-transparent dark:bg-emerald-500',
    warning: 'bg-amber-600 text-white border-transparent dark:bg-amber-500',
    error: 'bg-red-600 text-white border-transparent dark:bg-red-500',
    info: 'bg-sky-600 text-white border-transparent dark:bg-sky-500',
    pending: 'bg-amber-600 text-white border-transparent dark:bg-amber-500',
    review: 'bg-indigo-600 text-white border-transparent dark:bg-indigo-500',
    approved: 'bg-emerald-600 text-white border-transparent dark:bg-emerald-500',
    published: 'bg-sky-600 text-white border-transparent dark:bg-sky-500',
    resolved: 'bg-teal-600 text-white border-transparent dark:bg-teal-500',
    rejected: 'bg-red-600 text-white border-transparent dark:bg-red-500',
    default: 'bg-slate-700 text-white border-transparent dark:bg-slate-600',
  };

  // Outline styling mapping
  const outlineStyles: Record<BadgeStatus, string> = {
    success: 'bg-transparent text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700',
    warning: 'bg-transparent text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700',
    error: 'bg-transparent text-red-700 border-red-300 dark:text-red-400 dark:border-red-700',
    info: 'bg-transparent text-sky-700 border-sky-300 dark:text-sky-400 dark:border-sky-700',
    pending: 'bg-transparent text-amber-700 border-amber-300 dark:text-amber-400 dark:border-amber-700',
    review: 'bg-transparent text-indigo-700 border-indigo-300 dark:text-indigo-400 dark:border-indigo-700',
    approved: 'bg-transparent text-emerald-700 border-emerald-300 dark:text-emerald-400 dark:border-emerald-700',
    published: 'bg-transparent text-sky-700 border-sky-300 dark:text-sky-400 dark:border-sky-700',
    resolved: 'bg-transparent text-teal-700 border-teal-300 dark:text-teal-400 dark:border-teal-700',
    rejected: 'bg-transparent text-red-700 border-red-300 dark:text-red-400 dark:border-red-700',
    default: 'bg-transparent text-slate-700 border-slate-300 dark:text-slate-400 dark:border-slate-700',
  };

  // Dot color mapping
  const dotColorMap: Record<BadgeStatus, string> = {
    success: 'bg-emerald-500 dark:bg-emerald-400',
    warning: 'bg-amber-500 dark:bg-amber-400',
    error: 'bg-red-500 dark:bg-red-400',
    info: 'bg-sky-500 dark:bg-sky-400',
    pending: 'bg-amber-500 dark:bg-amber-400',
    review: 'bg-indigo-500 dark:bg-indigo-400',
    approved: 'bg-emerald-500 dark:bg-emerald-400',
    published: 'bg-sky-500 dark:bg-sky-400',
    resolved: 'bg-teal-500 dark:bg-teal-400',
    rejected: 'bg-red-500 dark:bg-red-400',
    default: 'bg-slate-500 dark:bg-slate-400',
  };

  const variantClass =
    variant === 'solid'
      ? solidStyles[status]
      : variant === 'outline'
      ? outlineStyles[status]
      : subtleStyles[status];

  const sizeClass =
    size === 'sm'
      ? 'text-[10px] px-1.5 py-0.5 gap-1'
      : 'text-xs px-2.5 py-0.5 gap-1.5 font-medium';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border whitespace-nowrap leading-tight select-none transition-colors',
        variantClass,
        sizeClass,
        className
      )}
      {...props}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            variant === 'solid' ? 'bg-white' : dotColorMap[status]
          )}
          aria-hidden="true"
        />
      )}
      <span>{children}</span>
    </span>
  );
};

export default Badge;
