import React from 'react';
import { Check, Shield, Lock, FileCheck } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { cn } from '@/utils';

export interface RoleStepperProps {
  currentStep: number;
  onStepClick?: (step: number) => void;
  isStepValid?: (step: number) => boolean;
  className?: string;
}

export const RoleStepper: React.FC<RoleStepperProps> = ({
  currentStep,
  onStepClick,
  isStepValid,
  className,
}) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  const steps = [
    {
      step: 1,
      title: t.roles.step1Title,
      description: t.roles.step1Description,
      icon: Shield,
    },
    {
      step: 2,
      title: t.roles.step2Title,
      description: t.roles.step2Description,
      icon: Lock,
    },
    {
      step: 3,
      title: t.roles.step3Title,
      description: t.roles.step3Description,
      icon: FileCheck,
    },
  ];

  const formatStepNumber = (num: number): string => {
    if (!isBn) return String(num);
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return bnDigits[num] || String(num);
  };

  return (
    <nav
      aria-label="Role Creation Steps"
      className={cn(
        'w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 sm:p-5 shadow-xs',
        className
      )}
    >
      <ol className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 md:gap-4">
        {steps.map((item, index) => {
          const isCurrent = currentStep === item.step;
          const isCompleted = currentStep > item.step;
          const isClickable = Boolean(onStepClick && (isCompleted || (isStepValid && isStepValid(item.step))));
          const StepIcon = item.icon;

          return (
            <li
              key={item.step}
              className={cn(
                'flex-1 flex items-center',
                index < steps.length - 1 && 'relative'
              )}
            >
              <button
                type="button"
                disabled={!isClickable && !isCurrent}
                onClick={() => {
                  if (isClickable && onStepClick) {
                    onStepClick(item.step);
                  }
                }}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'w-full flex items-center gap-3 p-2.5 sm:p-3 rounded-lg text-left transition-all duration-150',
                  isCurrent &&
                    'bg-sky-50/80 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/80 shadow-2xs',
                  isCompleted &&
                    'hover:bg-slate-50 dark:hover:bg-slate-800/60 cursor-pointer border border-transparent',
                  !isCurrent && !isCompleted && 'opacity-60 cursor-not-allowed border border-transparent'
                )}
              >
                {/* Step indicator circle */}
                <div
                  className={cn(
                    'w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 font-semibold text-xs sm:text-sm transition-colors',
                    isCompleted
                      ? 'bg-emerald-600 dark:bg-emerald-500 text-white shadow-2xs'
                      : isCurrent
                      ? 'bg-sky-600 dark:bg-sky-500 text-white shadow-xs ring-4 ring-sky-100 dark:ring-sky-950'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4 stroke-[2.5]" />
                  ) : (
                    <span>{formatStepNumber(item.step)}</span>
                  )}
                </div>

                {/* Step details text */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'text-xs font-semibold uppercase tracking-wider block',
                        isCurrent
                          ? 'text-sky-700 dark:text-sky-300'
                          : isCompleted
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-slate-400 dark:text-slate-500'
                      )}
                    >
                      {isBn ? `ধাপ ${formatStepNumber(item.step)}` : `Step ${item.step}`}
                    </span>
                  </div>
                  <h2
                    className={cn(
                      'text-sm font-semibold truncate',
                      isCurrent
                        ? 'text-slate-900 dark:text-slate-100'
                        : isCompleted
                        ? 'text-slate-800 dark:text-slate-200'
                        : 'text-slate-500 dark:text-slate-400'
                    )}
                  >
                    {item.title}
                  </h2>
                </div>
              </button>

              {/* Separator on desktop */}
              {index < steps.length - 1 && (
                <div
                  className="hidden md:block w-6 h-[1px] bg-slate-200 dark:bg-slate-800 shrink-0 mx-1"
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
};

export default RoleStepper;
