import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { ComplaintParty } from '@/services/api/complaintPartiesApi';
import { AlertTriangle, Building2, RefreshCw, UserRound } from 'lucide-react';

export interface ComplaintPartiesCardProps {
  parties: ComplaintParty[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export const ComplaintPartiesCard: React.FC<ComplaintPartiesCardProps> = ({
  parties,
  loading = false,
  error = null,
  onRetry,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  if (!loading && !error && parties.length === 0) return null;

  return (
    <Card variant="default">
      <CardHeader className="border-b border-slate-100 dark:border-slate-800 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <UserRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>{isBn ? 'উল্লেখিত ব্যক্তি বা প্রতিষ্ঠান' : 'Mentioned People & Organizations'}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        {loading ? (
          <div className="space-y-3" aria-label={isBn ? 'তথ্য লোড হচ্ছে' : 'Loading mentioned parties'}>
            <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
            <div className="h-20 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          </div>
        ) : error ? (
          <div role="alert" className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/30 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-rose-900 dark:text-rose-200">
                  {isBn ? 'উল্লেখিত পক্ষের তথ্য লোড করা যায়নি' : 'Mentioned-party information could not be loaded'}
                </p>
                <p className="text-xs text-rose-700 dark:text-rose-300">{error}</p>
                {onRetry && (
                  <Button variant="secondary" size="sm" onClick={onRetry} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
                    <span>{isBn ? 'আবার চেষ্টা করুন' : 'Retry'}</span>
                  </Button>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {parties.map((party, index) => (
              <div key={party.id} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-start gap-3">
                  {party.partyType === 'business' || party.partyType === 'organization' ? (
                    <Building2 className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
                  ) : (
                    <UserRound className="w-4 h-4 mt-0.5 shrink-0 text-slate-500" />
                  )}
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {isBn ? `পক্ষ ${index + 1}` : `Party ${index + 1}`} · {party.partyType}
                    </p>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 break-words">
                      {party.name || (isBn ? 'নাম প্রদান করা হয়নি' : 'Name not provided')}
                    </p>
                  </div>
                </div>

                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  {party.roleOrDesignation && <PartyField label={isBn ? 'ভূমিকা / পদবি' : 'Role / Designation'} value={party.roleOrDesignation} />}
                  {party.organization && <PartyField label={isBn ? 'প্রতিষ্ঠান' : 'Organization'} value={party.organization} />}
                  {party.phoneOrContact && <PartyField label={isBn ? 'যোগাযোগ' : 'Contact'} value={party.phoneOrContact} />}
                  {party.publicProfileHandle && <PartyField label={isBn ? 'পাবলিক প্রোফাইল' : 'Public Profile'} value={party.publicProfileHandle} />}
                  {party.address && <PartyField label={isBn ? 'ঠিকানা' : 'Address'} value={party.address} />}
                  {party.identifyingDescription && <PartyField label={isBn ? 'শনাক্তকরণ বিবরণ' : 'Identifying Description'} value={party.identifyingDescription} />}
                </dl>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const PartyField: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="min-w-0 space-y-1">
    <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
    <dd className="text-sm text-slate-900 dark:text-slate-100 break-words whitespace-pre-wrap">{value}</dd>
  </div>
);
