import React, { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/utils';

export type CardVariant = 'default' | 'interactive' | 'highlighted';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

export const Card = forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', padding = 'md', children, ...props }, ref) => {
    const variantStyles: Record<CardVariant, string> = {
      default:
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm',
      interactive:
        'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-md cursor-pointer transition-all duration-150',
      highlighted:
        'bg-sky-50/40 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/60 shadow-sm',
    };

    const paddingStyles = {
      none: '',
      sm: 'p-3.5',
      md: 'p-5',
      lg: 'p-6 sm:p-8',
    };

    return (
      <div
        ref={ref}
        className={cn(
          'rounded-lg text-slate-900 dark:text-slate-100 overflow-hidden',
          variantStyles[variant],
          paddingStyles[padding],
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
Card.displayName = 'Card';

export const CardHeader: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn('flex flex-col space-y-1 pb-4 border-b border-slate-100 dark:border-slate-800/60', className)}
      {...props}
    >
      {children}
    </div>
  );
};
CardHeader.displayName = 'CardHeader';

export const CardTitle: React.FC<HTMLAttributes<HTMLHeadingElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <h3
      className={cn('text-base font-semibold leading-none tracking-tight text-slate-900 dark:text-slate-100', className)}
      {...props}
    >
      {children}
    </h3>
  );
};
CardTitle.displayName = 'CardTitle';

export const CardDescription: React.FC<HTMLAttributes<HTMLParagraphElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <p
      className={cn('text-xs text-slate-500 dark:text-slate-400 leading-relaxed mt-1', className)}
      {...props}
    >
      {children}
    </p>
  );
};
CardDescription.displayName = 'CardDescription';

export const CardContent: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div className={cn('pt-4', className)} {...props}>
      {children}
    </div>
  );
};
CardContent.displayName = 'CardContent';

export const CardFooter: React.FC<HTMLAttributes<HTMLDivElement>> = ({
  className,
  children,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex items-center justify-between pt-4 mt-4 border-t border-slate-100 dark:border-slate-800/60 text-xs text-slate-500 dark:text-slate-400',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
};
CardFooter.displayName = 'CardFooter';

export default Card;
