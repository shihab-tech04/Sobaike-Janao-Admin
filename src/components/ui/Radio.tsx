import React, { InputHTMLAttributes, forwardRef, createContext, useContext } from 'react';
import { cn } from '@/utils';

interface RadioGroupContextType {
  name?: string;
  value?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
}

const RadioGroupContext = createContext<RadioGroupContextType | undefined>(undefined);

export interface RadioGroupProps {
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
  orientation?: 'horizontal' | 'vertical';
}

export const RadioGroup: React.FC<RadioGroupProps> = ({
  name,
  value,
  onChange,
  disabled,
  className,
  children,
  orientation = 'vertical',
}) => {
  return (
    <RadioGroupContext.Provider value={{ name, value, onChange, disabled }}>
      <div
        role="radiogroup"
        className={cn(
          'flex',
          orientation === 'horizontal' ? 'flex-row gap-4' : 'flex-col gap-2.5',
          className
        )}
      >
        {children}
      </div>
    </RadioGroupContext.Provider>
  );
};

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(
  (
    {
      className,
      label,
      description,
      checked,
      disabled: localDisabled,
      name: localName,
      value,
      id,
      onChange,
      ...props
    },
    ref
  ) => {
    const groupContext = useContext(RadioGroupContext);
    const disabled = localDisabled ?? groupContext?.disabled ?? false;
    const name = localName ?? groupContext?.name;
    const isChecked =
      checked !== undefined ? checked : groupContext?.value !== undefined ? groupContext.value === value : false;

    const radioId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (onChange) onChange(e);
      if (groupContext?.onChange) groupContext.onChange(e);
    };

    return (
      <label
        htmlFor={radioId}
        className={cn(
          'inline-flex items-start gap-2.5 select-none cursor-pointer group',
          disabled && 'cursor-not-allowed opacity-60'
        )}
      >
        <div className="relative flex items-center justify-center mt-0.5">
          <input
            id={radioId}
            ref={ref}
            type="radio"
            name={name}
            value={value}
            checked={isChecked}
            disabled={disabled}
            onChange={handleChange}
            className="sr-only"
            {...props}
          />
          <div
            className={cn(
              'w-4 h-4 rounded-full border transition-all duration-150 flex items-center justify-center',
              isChecked
                ? 'bg-sky-600 border-sky-600 dark:bg-sky-500 dark:border-sky-500'
                : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 group-hover:border-slate-400 dark:group-hover:border-slate-600',
              'group-focus-within:ring-2 group-focus-within:ring-sky-500 group-focus-within:ring-offset-2 dark:group-focus-within:ring-offset-slate-950',
              className
            )}
          >
            {isChecked && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
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

Radio.displayName = 'Radio';
export default Radio;
