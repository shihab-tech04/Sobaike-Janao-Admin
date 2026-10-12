import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';

export interface RoleEmptyStateProps {
  className?: string;
}

export const RoleEmptyState: React.FC<RoleEmptyStateProps> = ({ className = '' }) => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div
      className={`flex flex-col items-center justify-center p-8 sm:p-12 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 my-4 ${className}`}
    >
      <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4 shadow-xs">
        <Shield className="w-7 h-7" />
      </div>

      <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
        {t.roles.emptyTitle}
      </h3>

      <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
        {t.roles.emptyDescription}
      </p>

      <div className="flex flex-col items-center">
        <Button
          id="empty-create-role-btn"
          variant="primary"
          size="sm"
          onClick={() => navigate('/roles/create')}
          leftIcon={<Plus className="w-4 h-4" />}
        >
          <span>{t.roles.createRole}</span>
        </Button>
      </div>
    </div>
  );
};

export default RoleEmptyState;


