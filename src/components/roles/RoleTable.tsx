import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { RoleListItem } from '@/types/Role';
import { Shield, KeyRound, Users, Calendar, Eye } from 'lucide-react';

export interface RoleTableProps {
  roles: RoleListItem[];
}

export const RoleTable: React.FC<RoleTableProps> = ({ roles }) => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  const isBn = language === 'bn';

  const handleViewDetail = (roleId: string) => {
    navigate(`/roles/${roleId}`);
  };

  const formatNumber = (num: number): string => {
    if (!isBn) return num.toLocaleString();
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return num
      .toLocaleString()
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  const formatDate = (isoString?: string): string => {
    if (!isoString) return '—';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[280px]">{t.roles.roleName}</TableHead>
            <TableHead className="w-[110px]">{t.roles.status}</TableHead>
            <TableHead className="w-[150px]">{t.roles.permissions}</TableHead>
            <TableHead className="w-[160px]">{t.roles.assignedUsers}</TableHead>
            <TableHead className="w-[140px]">{t.roles.created}</TableHead>
            <TableHead className="w-[90px] text-right">{t.common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {roles.map((role) => {
            const displayName = isBn ? role.name_bn || role.name_en : role.name_en;

            return (
              <TableRow
                key={role.id}
                className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group cursor-pointer"
                onClick={() => handleViewDetail(role.id)}
              >
                {/* 1. Role Name & Description */}
                <TableCell className="font-medium">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 p-1.5 rounded-md bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400 shrink-0">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewDetail(role.id);
                          }}
                          className="font-semibold text-slate-900 dark:text-slate-100 text-xs sm:text-sm hover:text-sky-600 dark:hover:text-sky-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sky-500 rounded text-left transition-colors"
                        >
                          {displayName}
                        </button>
                        {role.is_system && (
                          <Badge size="sm" variant="subtle" status="info">
                            {t.roles.system}
                          </Badge>
                        )}
                      </div>
                      {role.description && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 leading-normal">
                          {role.description}
                        </p>
                      )}
                    </div>
                  </div>
                </TableCell>

                {/* 2. Status Badge */}
                <TableCell>
                  <Badge
                    size="sm"
                    status={role.active ? 'success' : 'default'}
                    dot
                  >
                    {role.active ? t.roles.active : t.roles.inactive}
                  </Badge>
                </TableCell>

                {/* 3. Permissions Count */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span>
                      {formatNumber(role.permission_count)}{' '}
                      <span className="text-slate-500 dark:text-slate-400">
                        {role.permission_count === 1
                          ? t.roles.permissionSingular
                          : t.roles.permissionPlural}
                      </span>
                    </span>
                  </div>
                </TableCell>

                {/* 4. Assigned Users Count */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <Users className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0" />
                    <span>
                      {formatNumber(role.assigned_user_count)}{' '}
                      <span className="text-slate-500 dark:text-slate-400">
                        {role.assigned_user_count === 1
                          ? t.roles.userSingular
                          : t.roles.userPlural}
                      </span>
                    </span>
                  </div>
                </TableCell>

                {/* 5. Created Date */}
                <TableCell>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span>{formatDate(role.created_at)}</span>
                  </div>
                </TableCell>

                {/* 6. Action Button */}
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleViewDetail(role.id);
                    }}
                    className="h-7 px-2.5 text-xs text-slate-600 dark:text-slate-300 hover:text-sky-600 dark:hover:text-sky-400"
                    aria-label={`${t.roles.viewDetails}: ${displayName}`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1" />
                    <span>{t.roles.viewRole}</span>
                  </Button>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

export default RoleTable;

