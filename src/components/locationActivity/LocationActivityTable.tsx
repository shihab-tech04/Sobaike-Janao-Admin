import React from 'react';
import { Eye, Clock, Monitor, Smartphone, Tablet, HelpCircle, MapPin, Globe, Compass, Loader2 } from 'lucide-react';
import { PublicVisitSession } from '@/types/LocationActivity';
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { LocationPermissionBadge } from './LocationPermissionBadge';
import { LocationActivityEmptyState } from './LocationActivityEmptyState';
import { useLanguage } from '@/context/LanguageContext';
import { useResolvedLocations } from '@/hooks/useReverseGeocoding';

export interface LocationActivityTableProps {
  sessions: PublicVisitSession[];
  selectedSession?: PublicVisitSession | null;
  onSelectSession: (session: PublicVisitSession) => void;
  hasFilters?: boolean;
  onResetFilters?: () => void;
  isLoading?: boolean;
}

export const LocationActivityTable: React.FC<LocationActivityTableProps> = ({
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

  // Format date/time
  const formatTimestamp = (dateString?: string | null) => {
    if (!dateString) return '—';
    try {
      const d = new Date(dateString);
      if (isNaN(d.getTime())) return dateString;
      return d.toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Render Device icon & label
  const renderDevice = (category?: string | null) => {
    const cat = (category || '').toLowerCase();
    if (cat.includes('desktop')) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <Monitor className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>{isBn ? 'ডেস্কটপ' : 'Desktop'}</span>
        </div>
      );
    }
    if (cat.includes('mobile')) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <Smartphone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>{isBn ? 'মোবাইল' : 'Mobile'}</span>
        </div>
      );
    }
    if (cat.includes('tablet')) {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
          <Tablet className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span>{isBn ? 'ট্যাবলেট' : 'Tablet'}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{category || (isBn ? 'অজানা' : 'Unknown')}</span>
      </div>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[180px]">{isBn ? 'সর্বশেষ সক্রিয়' : 'Last Seen'}</TableHead>
          <TableHead className="w-[130px]">{isBn ? 'অনুমতি' : 'Permission'}</TableHead>
          <TableHead className="min-w-[200px]">{isBn ? 'লোকেশন' : 'Location'}</TableHead>
          <TableHead className="w-[100px]">{isBn ? 'নির্ভুলতা' : 'Accuracy'}</TableHead>
          <TableHead className="w-[110px]">{isBn ? 'ডিভাইস' : 'Device'}</TableHead>
          <TableHead className="w-[150px]">{isBn ? 'ব্রাউজার' : 'Browser'}</TableHead>
          <TableHead className="w-[110px]">{isBn ? 'ওএস' : 'OS'}</TableHead>
          <TableHead className="w-[140px]">{isBn ? 'টাইমজোন' : 'Timezone'}</TableHead>
          <TableHead className="w-[80px] text-right">{isBn ? 'অ্যাকশন' : 'Action'}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sessions.map((session) => {
          const isSelected = selectedSession?.id === session.id;
          const isGranted =
            session.permission_status === 'granted' &&
            session.latitude !== null &&
            session.longitude !== null;

          const resolved = isGranted ? getLocation(session.latitude, session.longitude) : null;
          const isResolving = isGranted ? isLoadingLocation(session.latitude, session.longitude) : false;

          return (
            <TableRow
              key={session.id}
              className={`transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-sky-50/70 dark:bg-sky-950/30'
                  : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/50'
              }`}
              onClick={() => onSelectSession(session)}
            >
              {/* 1. Last Seen */}
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400 font-mono">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{formatTimestamp(session.last_seen_at)}</span>
                </div>
              </TableCell>

              {/* 2. Permission */}
              <TableCell>
                <LocationPermissionBadge status={session.permission_status} />
              </TableCell>

              {/* 3. Location (Human-Readable Primary + Coordinates Secondary) */}
              <TableCell>
                {isGranted ? (
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5 text-xs">
                      <MapPin className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      {isResolving ? (
                        <span className="inline-flex items-center gap-1 text-xs text-sky-600 dark:text-sky-400">
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                          <span>{isBn ? 'লোকেশন শনাক্ত করা হচ্ছে…' : 'Resolving location...'}</span>
                        </span>
                      ) : (
                        <span className="font-semibold text-slate-900 dark:text-slate-100 truncate block max-w-[220px]" title={resolved?.fullAddress || resolved?.shortLabel}>
                          {resolved?.shortLabel || (isBn ? 'লোকেশন' : 'Location available')}
                        </span>
                      )}
                    </div>
                    {/* Secondary Raw Coordinates */}
                    <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400 pl-5">
                      {session.latitude?.toFixed(6)}, {session.longitude?.toFixed(6)}
                    </div>
                    {resolved && (
                      <div className="pl-5 pt-0.5">
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
                  <div className="flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500 italic">
                    <MapPin className="w-3.5 h-3.5 shrink-0 opacity-50" />
                    <span>
                      {session.permission_status === 'denied' || session.permission_status === 'prompt'
                        ? isBn
                          ? 'লোকেশন শেয়ার করা হয়নি'
                          : 'Location not shared'
                        : isBn
                        ? 'লোকেশন অনুপলব্ধ'
                        : 'Location unavailable'}
                    </span>
                  </div>
                )}
              </TableCell>

              {/* 4. Accuracy */}
              <TableCell>
                <span className="text-xs font-mono text-slate-600 dark:text-slate-400">
                  {session.accuracy_meters !== null && session.accuracy_meters !== undefined
                    ? `±${Math.round(session.accuracy_meters)} m`
                    : '—'}
                </span>
              </TableCell>

              {/* 5. Device Category */}
              <TableCell>{renderDevice(session.device_category)}</TableCell>

              {/* 6. Browser */}
              <TableCell>
                <div className="flex items-center gap-1.5 text-xs text-slate-800 dark:text-slate-200">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">
                    {session.browser_name || '—'} {session.browser_version || ''}
                  </span>
                </div>
              </TableCell>

              {/* 7. OS */}
              <TableCell>
                <span className="text-xs text-slate-700 dark:text-slate-300">
                  {session.os_name || '—'}
                </span>
              </TableCell>

              {/* 8. Timezone */}
              <TableCell>
                <div className="flex items-center gap-1 text-xs font-mono text-slate-600 dark:text-slate-400">
                  <Compass className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{session.timezone || '—'}</span>
                </div>
              </TableCell>

              {/* 9. Action Button */}
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectSession(session);
                  }}
                  leftIcon={<Eye className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />}
                  className="text-xs"
                >
                  {isBn ? 'দেখুন' : 'View'}
                </Button>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
};

export default LocationActivityTable;
