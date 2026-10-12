import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { RoleDetail } from '@/types/Role';
import {
  Shield,
  KeyRound,
  Users,
  Calendar,
  Clock,
  Copy,
  Check,
  Hash,
  FileText,
  Lock,
} from 'lucide-react';

export interface RoleOverviewCardProps {
  role: RoleDetail;
}

export const RoleOverviewCard: React.FC<RoleOverviewCardProps> = ({ role }) => {
  const { t, language } = useLanguage();
  const isBn = language === 'bn';
  const [copiedId, setCopiedId] = useState<boolean>(false);

  const formatNumber = (num: number): string => {
    if (!isBn) return num.toLocaleString();
    const bnDigits = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
    return num
      .toLocaleString()
      .split('')
      .map((d) => (/[0-9]/.test(d) ? bnDigits[parseInt(d, 10)] : d))
      .join('');
  };

  const formatDate = (isoString?: string | null): string => {
    if (!isoString) return t.roles.neverUpdated;
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(role.id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Fallback if clipboard API not available
    }
  };

  return (
    <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
      <CardHeader className="pb-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t.roles.reviewRoleDetails}
              </CardTitle>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t.roles.step1Description}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {role.is_system ? (
              <Badge size="md" variant="subtle" status="info">
                <Lock className="w-3.5 h-3.5 mr-1" />
                {t.roles.systemRole}
              </Badge>
            ) : (
              <Badge size="md" variant="subtle">
                {t.roles.customRole}
              </Badge>
            )}

            <Badge
              size="md"
              status={role.active ? 'success' : 'default'}
              dot
            >
              {role.active ? t.roles.active : t.roles.inactive}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-5 space-y-6">
        {/* Top Key Identifiers Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* 1. English Name */}
          <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.roles.englishName}
            </span>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {role.name_en}
            </p>
          </div>

          {/* 2. Bengali Name */}
          <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              {t.roles.bengaliName}
            </span>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {role.name_bn || (
                <span className="text-slate-400 dark:text-slate-500 font-normal italic">
                  {t.roles.notSpecified}
                </span>
              )}
            </p>
          </div>

          {/* 3. Technical Role ID */}
          <div className="p-3.5 rounded-lg bg-slate-50/70 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Hash className="w-3 h-3" />
                {t.roles.technicalRoleId}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopyId}
                className="h-6 px-1.5 text-[11px] text-slate-500 hover:text-sky-600 dark:hover:text-sky-400"
                aria-label={t.roles.copyId}
                title={t.roles.copyId}
              >
                {copiedId ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500 mr-1" />
                    <span className="text-emerald-600 dark:text-emerald-400">{t.roles.idCopied}</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 mr-1" />
                    <span>{t.roles.copyId}</span>
                  </>
                )}
              </Button>
            </div>
            <p className="font-mono text-xs font-semibold text-sky-700 dark:text-sky-300 break-all select-all" title={role.id}>
              {role.id}
            </p>
          </div>
        </div>

        {/* Description Section */}
        <div className="p-4 rounded-lg bg-slate-50/50 dark:bg-slate-800/30 border border-slate-200/60 dark:border-slate-800 space-y-1.5">
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-slate-400" />
            {t.roles.descriptionLabel}
          </span>
          {role.description ? (
            <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
              {role.description}
            </p>
          ) : (
            <p className="text-xs text-slate-400 dark:text-slate-500 italic">
              {t.roles.noDescriptionProvided}
            </p>
          )}
        </div>

        {/* Stats & Timestamps Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          {/* Assigned Users Count */}
          <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50/50 dark:bg-slate-800/20">
            <div className="p-2 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                {t.roles.assignedUsers}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(role.assigned_user_count)}
              </span>
            </div>
          </div>

          {/* Permissions Count */}
          <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50/50 dark:bg-slate-800/20">
            <div className="p-2 rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 shrink-0">
              <KeyRound className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                {t.roles.permissions}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {formatNumber(role.permission_count)}
              </span>
            </div>
          </div>

          {/* Created Date */}
          <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50/50 dark:bg-slate-800/20">
            <div className="p-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
              <Calendar className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                {t.roles.created}
              </span>
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate" title={formatDate(role.created_at)}>
                {formatDate(role.created_at)}
              </span>
            </div>
          </div>

          {/* Last Updated Date */}
          <div className="flex items-center gap-3 p-3 rounded-md bg-slate-50/50 dark:bg-slate-800/20">
            <div className="p-2 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block truncate">
                {t.roles.lastUpdated}
              </span>
              <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate" title={formatDate(role.updated_at)}>
                {formatDate(role.updated_at)}
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default RoleOverviewCard;
