import React, { useState } from 'react';
import { Drawer } from '@/components/ui/Drawer';
import { AuditLogItem } from '@/types/AuditLog';
import { useLanguage } from '@/context/LanguageContext';
import {
  getAuditActionMeta,
  formatTargetType,
  getSeverityClasses,
  formatAuditTimestamp,
  sanitizeAuditDetails,
  getActorDisplayInfo,
} from '@/utils/auditLogUtils';
import {
  User,
  Shield,
  FileText,
  Calendar,
  ArrowRight,
  Code2,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { cn } from '@/utils';

export interface ActivityLogDetailDrawerProps {
  log: AuditLogItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ActivityLogDetailDrawer: React.FC<ActivityLogDetailDrawerProps> = ({
  log,
  isOpen,
  onClose,
}) => {
  const { language } = useLanguage();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState<boolean>(false);

  if (!log) return null;

  const actionMeta = getAuditActionMeta(log.action);
  const severityClasses = getSeverityClasses(actionMeta.severity);
  const ActionIcon = actionMeta.icon;
  const timeInfo = formatAuditTimestamp(log.created_at, language);
  const sanitizedDetails = sanitizeAuditDetails(log.details || {});

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={language === 'bn' ? 'অডিট ইভেন্ট বিবরণ' : 'Audit Event Details'}
      description={
        language === 'bn'
          ? 'প্রশাসনিক সিস্টেম কার্যক্রমের বিস্তারিত রেকর্ড'
          : 'Detailed audit record of administrative system activity'
      }
      mobileSheet={true}
      size="lg"
    >
      <div className="p-4 sm:p-6 space-y-6" id="activity-log-detail-content">
        {/* Action Header Card */}
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold border shadow-2xs',
                  severityClasses.badge
                )}
              >
                <ActionIcon className="w-4 h-4 shrink-0" />
                {language === 'bn' ? actionMeta.labelBn : actionMeta.labelEn}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 shrink-0">
              <Calendar className="w-3.5 h-3.5" />
              <span>{timeInfo.full}</span>
            </div>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            {language === 'bn' ? actionMeta.descBn : actionMeta.descEn}
          </p>
        </div>

        {/* Actor & Target Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Actor Info */}
          {(() => {
            const actorInfo = getActorDisplayInfo(log, language);
            return (
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                  <User className="w-3.5 h-3.5 text-sky-500" />
                  <span>{language === 'bn' ? 'কর্তৃপক্ষ (অ্যাক্টর)' : 'Actor (Admin)'}</span>
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {actorInfo.primary}
                </p>
                {actorInfo.secondary && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {actorInfo.secondary}
                  </p>
                )}
                {log.actor_id && actorInfo.primary !== log.actor_id && actorInfo.secondary !== `ID: ${log.actor_id}` && (
                  <p className="text-[11px] font-mono text-slate-400 dark:text-slate-500 truncate">
                    ID: {log.actor_id}
                  </p>
                )}
              </div>
            );
          })()}

          {/* Target Info */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-indigo-500" />
              <span>{language === 'bn' ? 'টার্গেট রেফারেন্স' : 'Target Reference'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                {formatTargetType(log.target_type, language)}
              </span>
              <p className="text-sm font-semibold font-mono text-slate-900 dark:text-slate-100 truncate">
                {log.target_id || '—'}
              </p>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {language === 'bn' ? 'টাইপ:' : 'Entity:'} {log.target_type}
            </p>
          </div>
        </div>

        {/* Structured Details Section */}
        <div className="space-y-3">
          <h4 className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
            {language === 'bn' ? 'কার্যক্রম বিবরণ ও পরিবর্তন' : 'Event Details & Changes'}
          </h4>

          {/* Role Change Diff */}
          {(log.action === 'admin.role_changed' || log.action === 'ADMIN_USER_UPDATED') &&
            (() => {
              const prevRole = log.details?.previous_role_name || log.details?.previous_role_id;
              const newRole =
                log.details?.new_role_name ||
                log.details?.new_role_id ||
                (log.details?.role_changed ? log.details?.role_name || log.details?.role_id : undefined);

              const hasTransition =
                prevRole &&
                newRole &&
                (prevRole !== newRole || log.details?.role_changed === true || log.action === 'admin.role_changed');

              if (!hasTransition && !log.details?.role_changed) return null;

              return (
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                    {language === 'bn' ? 'ভূমিকা বরাদ্দ পরিবর্তন:' : 'Role Assignment Transition:'}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="px-2.5 py-1 rounded-md bg-slate-200 dark:bg-slate-700 font-medium text-slate-800 dark:text-slate-200">
                      {prevRole || '—'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                    <span className="px-2.5 py-1 rounded-md bg-sky-100 dark:bg-sky-950 font-semibold text-sky-800 dark:text-sky-300 border border-sky-300 dark:border-sky-800">
                      {newRole || '—'}
                    </span>
                  </div>
                </div>
              );
            })()}

          {/* Permissions Added / Removed Diff */}
          {(log.action === 'role.permissions_changed' || log.action === 'ROLE_PERMISSIONS_REPLACED') && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-3">
              {Array.isArray(log.details?.added_permissions) && log.details.added_permissions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {language === 'bn' ? 'সংযোজিত অনুমতিসমূহ' : 'Added Permissions'} (
                      {log.details.added_permissions.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {log.details.added_permissions.map((perm: string) => (
                      <span
                        key={perm}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                      >
                        +{perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {Array.isArray(log.details?.removed_permissions) && log.details.removed_permissions.length > 0 && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>
                      {language === 'bn' ? 'প্রত্যাহারকৃত অনুমতিসমূহ' : 'Removed Permissions'} (
                      {log.details.removed_permissions.length})
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {log.details.removed_permissions.map((perm: string) => (
                      <span
                        key={perm}
                        className="px-2 py-0.5 rounded-md text-[11px] font-mono font-medium bg-rose-100 dark:bg-rose-950/70 text-rose-800 dark:text-rose-300 border border-rose-300 dark:border-rose-800"
                      >
                        -{perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Complaint Publishing / Rejection Details */}
          {log.target_type === 'complaint' && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-2">
              {log.details?.reason_code && (
                <div className="text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'বাতিলের কোড:' : 'Reason Code:'}{' '}
                  </span>
                  <span className="font-mono px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200">
                    {log.details.reason_code}
                  </span>
                </div>
              )}
              {log.details?.note && (
                <div className="text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'মন্তব্য/নোট:' : 'Moderator Note:'}{' '}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300 italic">
                    "{log.details.note}"
                  </span>
                </div>
              )}
              {log.details?.reason && (
                <div className="text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'কারণ:' : 'Reason:'}{' '}
                  </span>
                  <span className="text-slate-600 dark:text-slate-300">
                    {log.details.reason}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Administrator Creation / Activation Details */}
          {log.target_type === 'admin_user' && log.action !== 'admin.role_changed' && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 space-y-1.5 text-xs">
              {log.details?.display_name && (
                <p>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'নাম:' : 'Name:'}{' '}
                  </span>
                  {log.details.display_name}
                </p>
              )}
              {log.details?.email && (
                <p>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'ইমেইল:' : 'Email:'}{' '}
                  </span>
                  {log.details.email}
                </p>
              )}
              {log.details?.role_name && (
                <p>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'বরাদ্দকৃত ভূমিকা:' : 'Assigned Role:'}{' '}
                  </span>
                  {log.details.role_name}
                </p>
              )}
              {typeof log.details?.active === 'boolean' && (
                <p>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {language === 'bn' ? 'অবস্থা:' : 'Status:'}{' '}
                  </span>
                  <span
                    className={cn(
                      'px-2 py-0.5 rounded-md font-medium text-[11px]',
                      log.details.active
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    )}
                  >
                    {log.details.active
                      ? language === 'bn' ? 'সক্রিয়' : 'Active'
                      : language === 'bn' ? 'নিষ্ক্রিয়' : 'Inactive'}
                  </span>
                </p>
              )}
            </div>
          )}
        </div>

        {/* Collapsible Technical Details Payload (Sanitized JSON) */}
        <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
          <button
            type="button"
            onClick={() => setShowTechnicalDetails(!showTechnicalDetails)}
            className="flex items-center justify-between w-full text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 py-1"
          >
            <div className="flex items-center gap-1.5">
              <Code2 className="w-3.5 h-3.5" />
              <span>
                {language === 'bn' ? 'প্রযুক্তিগত পেলোড (JSON)' : 'Technical Payload (JSON)'}
              </span>
            </div>
            {showTechnicalDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showTechnicalDetails && (
            <div className="mt-2.5 p-3 rounded-lg bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-56 leading-relaxed">
              <pre>{JSON.stringify(sanitizedDetails, null, 2)}</pre>
            </div>
          )}
        </div>
      </div>
    </Drawer>
  );
};
