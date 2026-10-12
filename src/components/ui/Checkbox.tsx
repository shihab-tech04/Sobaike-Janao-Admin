import React, { InputHTMLAttributes, forwardRef, useEffect, useRef } from 'react';
import { Check, Minus } from 'lucide-react';
import { cn } from '@/utils';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
  indeterminate?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(
  (
    {
      className,
      label,
      description,
      indeterminate = false,
      checked = false,
      disabled = false,
      id,
      onChange,
      ...props
    },
    ref
  ) => {
    const internalRef = useRef<HTMLInputElement | null>(null);
    const checkboxId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    useEffect(() => {
      if (internalRef.current) {
        internalRef.current.indeterminate = indeterminate;
      }
    }, [indeterminate]);

    const isChecked = Boolean(checked);

    return (
      <label
        htmlFor={checkboxId}
        className={cn(
          'inline-flex items-start gap-2.5 select-none cursor-pointer group',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            id={checkboxId}
            ref={(node) => {
              internalRef.current = node;
              if (typeof ref === 'function') ref(node);
              else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
            }}
            type="checkbox"
            checked={isChecked}
            disabled={disabled}
            onChange={onChange}
            className="sr-only"
            {...props}
          />
          <div
            className={cn(
              'w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center',
              isChecked || indeterminate
                ? 'bg-sky-600 border-sky-600 text-white dark:bg-sky-500 dark:border-sky-500'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 group-hover:border-slate-400 dark:group-hover:border-slate-600',
              'group-focus-within:ring-2 group-focus-within:ring-sky-500 group-focus-within:ring-offset-2 dark:group-focus-within:ring-offset-slate-950',
              className
            )}
          >
            {indeterminate ? (
              <Minus className="w-3 h-3 stroke-[3]" />
            ) : isChecked ? (
              <Check className="w-3 h-3 stroke-[3]" />
            ) : null}
          </div>
        </div>

        {(label || description) && (
          <div className="flex flex-col text-left">
            {label && (
              <span className="text-xs font-medium text-slate-800 dark:text-slate-200 leading-normal">
                {label}
              </span>
            )}
            {description && (
              <span className="text-[11px] text-slate-500 dark:text-slate-400 leading-normal">
                {description}
              </span>
            )}
          </div>
        )}
      </label>
    );
  }
);

Checkbox.displayName = 'Checkbox';
export default Checkbox;
