import React from 'react';
import { Eye, Clock, MapPin, Monitor, Smartphone, Tablet, HelpCircle, Globe, Compass, Loader2 } from 'lucide-react';
import { PublicVisitSession } from '@/types/LocationActivity';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { LocationPermissionBadge } from './LocationPermissionBadge';
import { LocationActivityEmptyState } from './LocationActivityEmptyState';
import { useLanguage } from '@/context/LanguageContext';
import { useResolvedLocations } from '@/hooks/useReverseGeocoding';

export interface MobileLocationActivityCardListProps {
  sessions: PublicVisitSession[];
  selectedSession?: PublicVisitSession | null;
  onSelectSession: (session: PublicVisitSession) => void;
  hasFilters?: boolean;
  onResetFilters?: () => void;
  isLoading?: boolean;
}

export const MobileLocationActivityCardList: React.FC<MobileLocationActivityCardListProps> = ({
  sessions,
  selectedSession,
  onSelectSession,
  hasFilters = false,
  onResetFilters,
  isLoading = false,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const { getLocation, isLoadingLocation } = useResolvedLocations(sessions, isBn ? 'bn' : 'en');

  if (!isLoading && sessions.length === 0) {
    return <LocationActivityEmptyState hasFilters={hasFilters} onResetFilters={onResetFilters} />;
  }

  const formatTimestamp = (dateString?: string | null) => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;
      return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  const renderDeviceIcon = (category?: string | null) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('desktop')) return <Monitor className="w-3.5 h-3.5 text-slate-500" />;
    if (cat.includes('mobile')) return <Smartphone className="w-3.5 h-3.5 text-slate-500" />;
    if (cat.includes('tablet')) return <Tablet className="w-3.5 h-3.5 text-slate-500" />;
    return <HelpCircle className="w-3.5 h-3.5 text-slate-400" />;
  };

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const isSelected = selectedSession?.id === session.id;
        const isGranted =
          session.permission_status === 'granted' &&
          session.latitude !== null &&
          session.longitude !== null;

        const resolved = isGranted ? getLocation(session.latitude, session.longitude) : null;
        const isResolving = isGranted ? isLoadingLocation(session.latitude, session.longitude) : false;

        return (
          <Card
            key={session.id}
            variant="default"
            className={`transition-all cursor-pointer ${
              isSelected ? 'ring-2 ring-sky-500 shadow-sm' : 'hover:border-slate-300 dark:hover:border-slate-700'
            }`}
            onClick={() => onSelectSession(session)}
          >
            <CardContent className="p-3.5 space-y-2.5">
              {/* Header: Permission Badge + Timestamp */}
              <div className="flex items-center justify-between gap-2">
                <LocationPermissionBadge status={session.permission_status} />
                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  <Clock className="w-3 h-3 text-slate-400" />
                  <span>{formatTimestamp(session.last_seen_at)}</span>
                </div>
              </div>

              {/* Location Row (Primary resolved name + secondary coordinates) */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-start gap-2">
                  <MapPin
                    className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
                      isGranted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 opacity-60'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    {isGranted ? (
                      <div>
                        {isResolving ? (
                          <div className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400">
                            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                            <span>{isBn ? 'লোকেশন শনাক্ত করা হচ্ছে…' : 'Resolving location...'}</span>
                          </div>
                        ) : (
                          <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                            {resolved?.shortLabel || (isBn ? 'লোকেশন' : 'Location available')}
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                          <span>
                            {session.latitude?.toFixed(5)}, {session.longitude?.toFixed(5)}
                          </span>
                          {session.accuracy_meters !== null && session.accuracy_meters !== undefined && (
                            <span className="text-slate-400 dark:text-slate-500 shrink-0">
                              ±{Math.round(session.accuracy_meters)}m
                            </span>
                          )}
                        </div>
                        {resolved && (
                          <div className="pt-1">
                            <a
                              href="https://www.openstreetmap.org/copyright"
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:underline transition-colors inline-block"
                            >
                              © OpenStreetMap contributors
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-xs text-slate-500 dark:text-slate-400 italic">
                        {session.permission_status === 'denied' || session.permission_status === 'prompt'
                          ? isBn
                            ? 'লোকেশন শেয়ার করা হয়নি'
                            : 'Location not shared'
                          : isBn
                          ? 'লোকেশন অনুপলব্ধ'
                          : 'Location unavailable'}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Device & Browser Info */}
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-2.5 rounded-md border border-slate-200 dark:border-slate-700/60">
                <div className="flex items-center gap-1.5 min-w-0">
                  {renderDeviceIcon(session.device_category)}
                  <span className="truncate capitalize">
                    {session.device_category || (isBn ? 'অজানা' : 'Unknown')}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 min-w-0">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {session.browser_name || '—'} {session.browser_version || ''}
                  </span>
                </div>
              </div>

              {/* Footer: Timezone & Details button */}
              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                  <Compass className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="truncate">{session.timezone || '—'}</span>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSession(session);
                  }}
                  leftIcon={<Eye className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
                  className="text-xs h-7 px-2.5 shrink-0"
                >
                  <span>{isBn ? 'বিস্তারিত দেখুন' : 'View Details'}</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
};

export default MobileLocationActivityCardList;
