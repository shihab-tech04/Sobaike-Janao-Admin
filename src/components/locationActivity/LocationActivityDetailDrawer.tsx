import React, { useState } from 'react';
import {
  MapPin,
  Smartphone,
  Globe,
  Copy,
  Check,
  Shield,
  FileCode,
  ExternalLink,
  Loader2,
  Navigation,
} from 'lucide-react';
import { PublicVisitSession } from '@/types/LocationActivity';
import { Drawer } from '@/components/ui/Drawer';
import { Button } from '@/components/ui/Button';
import { LocationPermissionBadge } from './LocationPermissionBadge';
import { useLanguage } from '@/context/LanguageContext';
import { useSingleResolvedLocation } from '@/hooks/useReverseGeocoding';

export interface LocationActivityDetailDrawerProps {
  session: PublicVisitSession | null;
  isOpen: boolean;
  onClose: () => void;
}

export const LocationActivityDetailDrawer: React.FC<LocationActivityDetailDrawerProps> = ({
  session,
  isOpen,
  onClose,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const isGranted =
    session?.permission_status === 'granted' &&
    session?.latitude !== null &&
    session?.latitude !== undefined &&
    session?.longitude !== null &&
    session?.longitude !== undefined;

  const { location: resolvedLocation, isLoading: isResolvingLocation } = useSingleResolvedLocation(
    isGranted ? session?.latitude : null,
    isGranted ? session?.longitude : null,
    isBn ? 'bn' : 'en'
  );

  if (!session) return null;

  const handleCopy = (text: string, key: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  };

  const formatDateTime = (dateString?: string | null) => {
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

  const screenResolution =
    session.screen_width && session.screen_height
      ? `${session.screen_width} × ${session.screen_height} px`
      : '—';

  const googleMapsUrl =
    session.latitude !== null && session.longitude !== null
      ? `https://www.google.com/maps?q=${encodeURIComponent(session.latitude)},${encodeURIComponent(session.longitude)}`
      : null;

  return (
    <Drawer
      isOpen={isOpen}
      onClose={onClose}
      title={isBn ? 'সেশন ও লোকেশন বিবরণ' : 'Session & Location Details'}
      description={
        isBn
          ? `সেশন আইডি: ${session.session_id.slice(0, 12)}...`
          : `Session ID: ${session.session_id.slice(0, 12)}...`
      }
      size="lg"
      mobileSheet
      footer={
        <div className="flex items-center justify-end w-full">
          <Button variant="secondary" size="sm" onClick={onClose}>
            <span>{isBn ? 'বন্ধ করুন' : 'Close'}</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Section 1: Location & Permission */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {isBn ? '১. লোকেশন ও অনুমতি' : '1. Location & Permission'}
            </h4>
          </div>

          <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            {/* Top Row: Permission Status & Accuracy */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-700/60">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  {isBn ? 'অনুমতি অবস্থা' : 'Permission Status'}
                </span>
                <LocationPermissionBadge status={session.permission_status} />
              </div>

              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                  {isBn ? 'নির্ভুলতা (Accuracy)' : 'Accuracy Radius'}
                </span>
                <span className="font-mono font-medium text-slate-800 dark:text-slate-200 text-xs">
                  {session.accuracy_meters !== null && session.accuracy_meters !== undefined
                    ? `±${Math.round(session.accuracy_meters)} meters`
                    : '—'}
                </span>
              </div>
            </div>

            {/* Resolved Location Highlight */}
            {isGranted ? (
              <div className="space-y-2.5">
                {/* Short Label */}
                <div className="bg-white dark:bg-slate-800/80 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 shadow-2xs">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Navigation className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                      {isBn ? 'লোকেশন' : 'Resolved Location'}
                    </span>
                    {isResolvingLocation && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-sky-600 dark:text-sky-400">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        <span>{isBn ? 'শনাক্ত হচ্ছে...' : 'Resolving...'}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug">
                    {resolvedLocation?.shortLabel ||
                      (isResolvingLocation
                        ? isBn
                          ? 'লোকেশন শনাক্ত করা হচ্ছে…'
                          : 'Resolving location...'
                        : isBn
                        ? 'লোকেশন উপলব্ধ'
                        : 'Location available')}
                  </p>

                  {/* Full Address if available */}
                  {resolvedLocation?.fullAddress && resolvedLocation.fullAddress !== resolvedLocation.shortLabel && (
                    <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/50">
                      <span className="text-[10px] uppercase font-semibold tracking-wider text-slate-400 dark:text-slate-500 block mb-0.5">
                        {isBn ? 'সম্পূর্ণ ঠিকানা' : 'Full Address'}
                      </span>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                        {resolvedLocation.fullAddress}
                      </p>
                    </div>
                  )}

                  {/* OpenStreetMap Attribution */}
                  {resolvedLocation && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-700/40 text-right">
                      <a
                        href="https://www.openstreetmap.org/copyright"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 hover:underline transition-colors inline-flex items-center gap-0.5"
                      >
                        © OpenStreetMap contributors
                      </a>
                    </div>
                  )}
                </div>

                {/* Coordinates Grid */}
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="bg-white/80 dark:bg-slate-800/60 p-2.5 rounded border border-slate-200 dark:border-slate-700/60">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                      {isBn ? 'অক্ষাংশ (Latitude)' : 'Latitude'}
                    </span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {session.latitude !== null ? session.latitude.toFixed(6) : '—'}
                    </span>
                  </div>

                  <div className="bg-white/80 dark:bg-slate-800/60 p-2.5 rounded border border-slate-200 dark:border-slate-700/60">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                      {isBn ? 'দ্রাঘিমাংশ (Longitude)' : 'Longitude'}
                    </span>
                    <span className="font-mono font-medium text-slate-900 dark:text-slate-100">
                      {session.longitude !== null ? session.longitude.toFixed(6) : '—'}
                    </span>
                  </div>
                </div>

                {/* Google Maps Button */}
                {googleMapsUrl && (
                  <div className="pt-1">
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 w-full px-3.5 py-2 text-xs font-medium rounded-md bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white dark:bg-sky-600 dark:hover:bg-sky-500 shadow-xs transition-colors"
                      aria-label={isBn ? 'গুগল ম্যাপে লোকেশন খুলুন' : 'Open location in Google Maps'}
                    >
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{isBn ? 'গুগল ম্যাপে খুলুন' : 'Open in Google Maps'}</span>
                      <ExternalLink className="w-3 h-3 opacity-80" />
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white/80 dark:bg-slate-800/60 p-3 rounded-lg border border-slate-200 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 italic">
                {session.permission_status === 'denied' || session.permission_status === 'prompt'
                  ? isBn
                    ? 'ভিজিটর লোকেশন অনুমতি প্রদান করেননি।'
                    : 'Visitor did not grant location permission.'
                  : isBn
                  ? 'লোকেশন ডাটা অনুপলব্ধ।'
                  : 'Location data unavailable.'}
              </div>
            )}

            {/* Location Updated Timestamp */}
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/60 text-xs">
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'লোকেশন সর্বশেষ আপডেট' : 'Location Updated At'}
              </span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {formatDateTime(session.location_updated_at)}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Session & Visitor Identifiers */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <Shield className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {isBn ? '২. সেশন ও পরিচয়' : '2. Session & Identifiers'}
            </h4>
          </div>

          <div className="space-y-2.5 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            {/* Session ID */}
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                {isBn ? 'সেশন আইডি (Session ID)' : 'Session ID'}
              </span>
              <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/80 p-2.5 rounded border border-slate-200 dark:border-slate-700/60">
                <span className="font-mono text-[11px] text-slate-900 dark:text-slate-100 break-all select-all">
                  {session.session_id}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(session.session_id, 'session_id')}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded transition-colors shrink-0"
                  title="Copy Session ID"
                  aria-label="Copy Session ID"
                >
                  {copiedKey === 'session_id' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Visitor ID */}
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">
                {isBn ? 'ভিজিটর আইডি (Visitor ID)' : 'Visitor ID'}
              </span>
              <div className="flex items-center justify-between gap-2 bg-white dark:bg-slate-800/80 p-2.5 rounded border border-slate-200 dark:border-slate-700/60">
                <span className="font-mono text-[11px] text-slate-900 dark:text-slate-100 break-all select-all">
                  {session.visitor_id}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy(session.visitor_id, 'visitor_id')}
                  className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/60 rounded transition-colors shrink-0"
                  title="Copy Visitor ID"
                  aria-label="Copy Visitor ID"
                >
                  {copiedKey === 'visitor_id' ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/60">
              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                  {isBn ? 'প্রথম দেখা' : 'First Seen'}
                </span>
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {formatDateTime(session.first_seen_at)}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                  {isBn ? 'সর্বশেষ সক্রিয়' : 'Last Seen'}
                </span>
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {formatDateTime(session.last_seen_at)}
                </span>
              </div>

              <div>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                  {isBn ? 'অনুমতি প্রদানের সময়' : 'Consented At'}
                </span>
                <span className="font-mono text-[11px] text-slate-700 dark:text-slate-300">
                  {formatDateTime(session.consented_at)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 3: Browser & Device */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <Smartphone className="w-4 h-4 text-purple-600 dark:text-purple-400 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {isBn ? '৩. ব্রাউজার ও অপারেটিং সিস্টেম' : '3. Browser & OS'}
            </h4>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'ডিভাইস টাইপ' : 'Device Category'}
              </span>
              <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">
                {session.device_category || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'ব্রাউজার' : 'Browser'}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {session.browser_name || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'ব্রাউজার ভার্সন' : 'Browser Version'}
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {session.browser_version || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'ওএস (OS Name)' : 'Operating System'}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200">
                {session.os_name || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'প্ল্যাটফর্ম' : 'Platform'}
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {session.platform || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Section 4: Display & Environment */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <Globe className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {isBn ? '৪. ডিসপ্লে ও পরিবেশ' : '4. Display & Environment'}
            </h4>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'ভাষা (Language)' : 'Language'}
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {session.language || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'টাইমজোন' : 'Timezone'}
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {session.timezone || '—'}
              </span>
            </div>

            <div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 block mb-0.5">
                {isBn ? 'স্ক্রিন রেজোলিউশন' : 'Screen Resolution'}
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200">
                {screenResolution}
              </span>
            </div>
          </div>
        </div>

        {/* Section 5: Technical Details (User Agent) */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-200 dark:border-slate-800">
            <FileCode className="w-4 h-4 text-slate-600 dark:text-slate-400 shrink-0" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
              {isBn ? '৫. কারিগরি তথ্য' : '5. Technical Details'}
            </h4>
          </div>

          <div className="space-y-2 text-xs bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">User Agent</span>
              {session.user_agent && (
                <button
                  type="button"
                  onClick={() => handleCopy(session.user_agent || '', 'user_agent')}
                  className="flex items-center gap-1 text-[11px] text-sky-600 hover:text-sky-700 dark:text-sky-400 dark:hover:text-sky-300 font-medium"
                >
                  {copiedKey === 'user_agent' ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-500" />
                      <span>{isBn ? 'কপি হয়েছে' : 'Copied'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>{isBn ? 'কপি' : 'Copy'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
            <div className="bg-white dark:bg-slate-800/80 p-3 rounded border border-slate-200 dark:border-slate-700/60 max-h-28 overflow-y-auto">
              <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 break-all leading-relaxed select-all">
                {session.user_agent || '—'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Drawer>
  );
};

export default LocationActivityDetailDrawer;
