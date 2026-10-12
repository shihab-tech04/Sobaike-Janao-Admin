import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { ComplaintLocation, ReporterDeviceLocation } from '@/types/Complaint';
import {
  MapPin,
  Compass,
  Copy,
  Check,
  Building,
  Smartphone,
  Lock,
  AlertCircle,
  MapPinOff,
  RefreshCw,
  Crosshair,
  Clock,
} from 'lucide-react';
import { cn } from '@/utils';
import {
  MapContainer as LeafletMapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface ComplaintLocationCardProps {
  location: ComplaintLocation;
  reporterDeviceLocation?: ReporterDeviceLocation | null;
  reporterLocationLoading?: boolean;
  reporterLocationError?: string | null;
  reporterLocationPermissionDenied?: boolean;
  onRetryReporterLocation?: () => void;
  className?: string;
}

/**
 * Capability check for desktop devices with fine pointer (mouse / trackpad)
 * Avoids trapping page scroll on touch / mobile devices while enabling normal zoom on desktop
 */
const checkDesktopFinePointer = (): boolean => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  }
  return false;
};

/**
 * Ensures Leaflet centers, synchronizes wheel zoom capabilities, and invalidates container size upon rendering
 */
const MapRecenter: React.FC<{ center: [number, number]; scrollWheelZoom?: boolean }> = ({
  center,
  scrollWheelZoom,
}) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 14);
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 150);
    return () => clearTimeout(timer);
  }, [center, map]);

  useEffect(() => {
    if (scrollWheelZoom) {
      map.scrollWheelZoom.enable();
    } else {
      map.scrollWheelZoom.disable();
    }
  }, [scrollWheelZoom, map]);

  return null;
};

export const ComplaintLocationCard: React.FC<ComplaintLocationCardProps> = ({
  location,
  reporterDeviceLocation,
  reporterLocationLoading = false,
  reporterLocationError = null,
  reporterLocationPermissionDenied = false,
  onRetryReporterLocation,
  className,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  const [copiedIncident, setCopiedIncident] = useState<boolean>(false);
  const [copiedDevice, setCopiedDevice] = useState<boolean>(false);

  // Desktop fine-pointer capability detection for normal desktop wheel/trackpad zoom
  const [scrollWheelZoomEnabled, setScrollWheelZoomEnabled] = useState<boolean>(checkDesktopFinePointer);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mediaQuery = window.matchMedia('(hover: hover) and (pointer: fine)');
    const handler = (e: MediaQueryListEvent) => {
      setScrollWheelZoomEnabled(e.matches);
    };

    setScrollWheelZoomEnabled(mediaQuery.matches);

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handler);
      return () => mediaQuery.removeEventListener('change', handler);
    } else if ('addListener' in mediaQuery) {
      (mediaQuery as any).addListener(handler);
      return () => (mediaQuery as any).removeListener(handler);
    }
  }, []);

  // 1. Incident Location Coordinate Validation
  const hasIncidentCoords = Boolean(
    location?.coordinates &&
    Array.isArray(location.coordinates) &&
    location.coordinates.length === 2 &&
    typeof location.coordinates[0] === 'number' &&
    typeof location.coordinates[1] === 'number' &&
    !isNaN(location.coordinates[0]) &&
    !isNaN(location.coordinates[1]) &&
    (location.coordinates[0] !== 0 || location.coordinates[1] !== 0)
  );

  const incidentLat = hasIncidentCoords ? location.coordinates![0] : null;
  const incidentLng = hasIncidentCoords ? location.coordinates![1] : null;

  // 2. Reporter Device Location Coordinate Validation (Private)
  const hasDeviceCoords = Boolean(
    reporterDeviceLocation &&
    typeof reporterDeviceLocation.latitude === 'number' &&
    typeof reporterDeviceLocation.longitude === 'number' &&
    !isNaN(reporterDeviceLocation.latitude) &&
    !isNaN(reporterDeviceLocation.longitude) &&
    (reporterDeviceLocation.latitude !== 0 || reporterDeviceLocation.longitude !== 0)
  );

  const deviceLat = hasDeviceCoords ? reporterDeviceLocation!.latitude : null;
  const deviceLng = hasDeviceCoords ? reporterDeviceLocation!.longitude : null;

  // Visual marker icon for incident location (Rose Pin)
  const incidentMarkerIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-incident-pin',
      html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:#e11d48;color:#ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.35);border:2.5px solid #ffffff;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });
  }, []);

  // Visual marker icon for private reporter device location (Indigo Device Pin)
  const deviceMarkerIcon = useMemo(() => {
    return L.divIcon({
      className: 'custom-reporter-device-pin',
      html: `<div style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:9999px;background:#4f46e5;color:#ffffff;box-shadow:0 3px 8px rgba(0,0,0,0.35);border:2.5px solid #ffffff;">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <rect width="14" height="20" x="5" y="2" rx="2" ry="2"/>
          <path d="M12 18h.01"/>
        </svg>
      </div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32],
    });
  }, []);

  const handleCopyIncidentCoords = () => {
    if (!hasIncidentCoords || incidentLat === null || incidentLng === null) return;
    navigator.clipboard.writeText(`${incidentLat}, ${incidentLng}`);
    setCopiedIncident(true);
    setTimeout(() => setCopiedIncident(false), 2000);
  };

  const handleCopyDeviceCoords = () => {
    if (!hasDeviceCoords || deviceLat === null || deviceLng === null) return;
    navigator.clipboard.writeText(`${deviceLat}, ${deviceLng}`);
    setCopiedDevice(true);
    setTimeout(() => setCopiedDevice(false), 2000);
  };

  // Format captured timestamp
  const formattedCapturedAt = useMemo(() => {
    if (!reporterDeviceLocation?.capturedAt) return null;
    try {
      const date = new Date(reporterDeviceLocation.capturedAt);
      if (isNaN(date.getTime())) return null;
      return date.toLocaleString(isBn ? 'bn-BD' : 'en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return reporterDeviceLocation.capturedAt;
    }
  }, [reporterDeviceLocation?.capturedAt, isBn]);

  return (
    <Card variant="default" className={cn('overflow-hidden', className)}>
      <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <MapPin className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          <span>{isBn ? 'ভৌগোলিক অবস্থান ও এলাকা' : 'Location & Jurisdictional Area'}</span>
        </CardTitle>

        {location.ward && (
          <Badge variant="subtle" size="sm">
            <Building className="w-3 h-3 mr-1 text-slate-500 dark:text-slate-400" />
            <span>{location.ward}</span>
          </Badge>
        )}
      </CardHeader>

      <CardContent className="pt-4 space-y-6">
        {/* ================================================================== */}
        {/* A. INCIDENT LOCATION (ঘটনাস্থল)                                    */}
        {/* ================================================================== */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                <span>{isBn ? 'ঘটনাস্থল' : 'Incident Location'}</span>
              </h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                {isBn
                  ? 'যেখানে ঘটনাটি ঘটেছে বলে অভিযোগে উল্লেখ করা হয়েছে।'
                  : 'Location reported for where the incident occurred.'}
              </p>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              {isBn ? 'নাগরিক দ্বারা নির্দেশিত' : 'Citizen Reported'}
            </span>
          </div>

          {/* Address Lines */}
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1">
              <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                {isBn ? 'দাখিলকৃত ঠিকানা' : 'Submitted Address'}
              </span>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {location.addressBn || location.addressEn || (isBn ? 'ঠিকানা প্রদান করা হয়নি' : 'Address not provided')}
              </p>
            </div>

            {location.addressEn && location.addressBn && location.addressBn !== location.addressEn && (
              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800 space-y-1">
                <span className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                  {isBn ? 'ইংরেজি ঠিকানা' : 'English Civic Address'}
                </span>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {location.addressEn}
                </p>
              </div>
            )}
          </div>

          {/* Administrative Area/Upazila and District breakdown */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                {isBn ? 'এলাকা / উপজেলা বা থানা' : 'Area / Upazila'}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {location.ward || '—'}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
              <span className="text-xs text-slate-500 dark:text-slate-400 block mb-1">
                {isBn ? 'জেলা' : 'District'}
              </span>
              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate block">
                {location.zone || '—'}
              </span>
            </div>
          </div>

          {/* Incident Location Map Preview */}
          {hasIncidentCoords && incidentLat !== null && incidentLng !== null ? (
            <div className="space-y-2">
              <div className="w-full h-48 sm:h-56 rounded-lg overflow-hidden border border-slate-200/80 dark:border-slate-800 relative z-0 shadow-inner">
                <LeafletMapContainer
                  center={[incidentLat, incidentLng]}
                  zoom={14}
                  zoomControl={false}
                  scrollWheelZoom={scrollWheelZoomEnabled}
                  className="w-full h-full z-0 outline-none"
                  style={{ width: '100%', height: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    maxZoom={19}
                  />
                  <MapRecenter center={[incidentLat, incidentLng]} scrollWheelZoom={scrollWheelZoomEnabled} />
                  <Marker position={[incidentLat, incidentLng]} icon={incidentMarkerIcon}>
                    <Popup className="custom-map-popup">
                      <div className="p-0.5 text-xs text-slate-800 dark:text-slate-100">
                        <p className="font-semibold text-rose-600 dark:text-rose-400">
                          {isBn ? 'ঘটনাস্থল' : 'Incident Location'}
                        </p>
                        <p className="font-medium mt-0.5">
                          {location.addressBn || location.addressEn || 'Incident Point'}
                        </p>
                        <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                          {incidentLat.toFixed(5)}, {incidentLng.toFixed(5)}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                </LeafletMapContainer>
              </div>

              {/* Coordinates Preview (Incident Coordinate Card with Copy) */}
              <div className="p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                    <Compass className="w-4 h-4 text-rose-400" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                      {isBn ? 'ঘটনাস্থল জিপিএস স্থানাঙ্ক (GPS)' : 'Incident GPS Coordinates'}
                    </span>
                    <span className="font-mono text-xs text-slate-200 font-semibold truncate block">
                      {incidentLat.toFixed(5)}, {incidentLng.toFixed(5)}
                    </span>
                  </div>
                </div>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleCopyIncidentCoords}
                  className="h-7 text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
                >
                  {copiedIncident ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400 mr-1" />
                      <span>{isBn ? 'কপি হয়েছে' : 'Copied'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3 mr-1 text-slate-400" />
                      <span>{isBn ? 'কপি' : 'Copy'}</span>
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : (
            // CASE C: Incident coordinates unavailable
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs flex items-center gap-2">
              <MapPinOff className="w-4 h-4 text-slate-400 shrink-0" />
              <span>
                {isBn
                  ? 'এই অভিযোগের জন্য সুনির্দিষ্ট জিপিএস স্থানাঙ্ক দেওয়া হয়নি।'
                  : 'Specific GPS coordinates were not provided for this incident location.'}
              </span>
            </div>
          )}
        </div>

        {/* Divider separating Incident Location and Reporter Device Location */}
        <hr className="border-slate-200 dark:border-slate-800" />

        {/* ================================================================== */}
        {/* B. REPORTER DEVICE LOCATION — PRIVATE (রিপোর্টারের ডিভাইস অবস্থান)     */}
        {/* ================================================================== */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 pb-1 border-b border-slate-100 dark:border-slate-800/80">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <Smartphone className="w-3.5 h-3.5" />
                  <span>{isBn ? 'রিপোর্টারের ডিভাইস অবস্থান' : 'Reporter Device Location'}</span>
                </h4>
                <Badge variant="subtle" size="sm" className="bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                  <Lock className="w-2.5 h-2.5 mr-1" />
                  <span>{isBn ? 'গোপনীয়' : 'Private'}</span>
                </Badge>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {isBn
                  ? 'অভিযোগ জমা দেওয়ার সময় রিপোর্টারের ডিভাইস থেকে ধারণ করা GPS অবস্থান। এটি ঘটনাস্থল নয়।'
                  : 'Device GPS captured when this complaint was submitted. This is not the reported incident location.'}
              </p>
            </div>
            <span className="text-[11px] font-medium text-slate-400">
              {isBn ? 'ডিভাইস টেলিমেট্রি' : 'Device Telemetry'}
            </span>
          </div>

          {/* Loading State */}
          {reporterLocationLoading && (
            <div className="p-6 rounded-lg border border-slate-200 dark:border-slate-800 space-y-3 bg-slate-50/50 dark:bg-slate-850/50 animate-pulse">
              <div className="h-4 w-48 bg-slate-200 dark:bg-slate-700 rounded" />
              <div className="h-40 bg-slate-200 dark:bg-slate-700 rounded-lg" />
              <div className="h-10 bg-slate-200 dark:bg-slate-700 rounded-lg" />
            </div>
          )}

          {/* CASE D: Permission Denied */}
          {!reporterLocationLoading && reporterLocationPermissionDenied && (
            <div className="p-4 rounded-lg bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-900 dark:text-amber-200 space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 dark:text-amber-300">
                <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>{isBn ? 'অনুমতি সীমাবদ্ধ' : 'Access Restricted'}</span>
              </div>
              <p className="text-xs text-amber-700 dark:text-amber-300/90 leading-relaxed">
                {isBn
                  ? 'ব্যক্তিগত রিপোর্টার ডিভাইস অবস্থান দেখার অনুমতি আপনার নেই। এই তথ্য কেবল অনুমোদিত সুপার অ্যাডমিনদের জন্য সংরক্ষিত।'
                  : 'You do not have permission to view private reporter device location. This sensitive telemetry is restricted to authorized Super Administrators.'}
              </p>
            </div>
          )}

          {/* CASE E: RPC / Backend Failure */}
          {!reporterLocationLoading && !reporterLocationPermissionDenied && reporterLocationError && (
            <div className="p-4 rounded-lg bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 text-rose-900 dark:text-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-rose-800 dark:text-rose-300">
                    {isBn ? 'রিপোর্টারের ডিভাইস অবস্থান লোড করা যায়নি' : 'Failed to Load Reporter Device Location'}
                  </p>
                  <p className="text-xs text-rose-700 dark:text-rose-300/90 mt-0.5">
                    {reporterLocationError}
                  </p>
                </div>
              </div>

              {onRetryReporterLocation && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRetryReporterLocation}
                  leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  className="shrink-0 h-8 text-xs bg-rose-100 dark:bg-rose-900/60 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800 hover:bg-rose-200"
                >
                  <span>{isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}</span>
                </Button>
              )}
            </div>
          )}

          {/* CASE B: Device location unavailable / not captured */}
          {!reporterLocationLoading &&
            !reporterLocationPermissionDenied &&
            !reporterLocationError &&
            (!reporterDeviceLocation || !hasDeviceCoords) && (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-xs flex items-center gap-2.5">
                <MapPinOff className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  {isBn
                    ? 'এই অভিযোগের জন্য ডিভাইস অবস্থান ধারণ করা হয়নি।'
                    : 'Device location was not captured for this complaint.'}
                </span>
              </div>
            )}

          {/* CASE A: Device location available */}
          {!reporterLocationLoading &&
            !reporterLocationPermissionDenied &&
            !reporterLocationError &&
            hasDeviceCoords &&
            deviceLat !== null &&
            deviceLng !== null && (
              <div className="space-y-3">
                {/* Device Location Map Preview */}
                <div className="w-full h-48 sm:h-56 rounded-lg overflow-hidden border border-slate-200/80 dark:border-slate-800 relative z-0 shadow-inner">
                  <LeafletMapContainer
                    center={[deviceLat, deviceLng]}
                    zoom={14}
                    zoomControl={false}
                    scrollWheelZoom={scrollWheelZoomEnabled}
                    className="w-full h-full z-0 outline-none"
                    style={{ width: '100%', height: '100%' }}
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                      maxZoom={19}
                    />
                    <MapRecenter center={[deviceLat, deviceLng]} scrollWheelZoom={scrollWheelZoomEnabled} />
                    <Marker position={[deviceLat, deviceLng]} icon={deviceMarkerIcon}>
                      <Popup className="custom-map-popup">
                        <div className="p-0.5 text-xs text-slate-800 dark:text-slate-100">
                          <p className="font-semibold text-indigo-600 dark:text-indigo-400">
                            {isBn ? 'রিপোর্টারের ডিভাইস অবস্থান (গোপনীয়)' : 'Reporter Device Location (Private)'}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {deviceLat.toFixed(5)}, {deviceLng.toFixed(5)}
                          </p>
                          {reporterDeviceLocation?.accuracyMeters !== null &&
                            reporterDeviceLocation?.accuracyMeters !== undefined && (
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {isBn ? 'নির্ভুলতা:' : 'Accuracy:'} ±{Math.round(reporterDeviceLocation.accuracyMeters)}m
                              </p>
                            )}
                        </div>
                      </Popup>
                    </Marker>
                  </LeafletMapContainer>
                </div>

                {/* Device Coordinates Preview with Copy */}
                <div className="p-3 rounded-lg bg-slate-900 text-slate-100 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded bg-slate-800 flex items-center justify-center shrink-0">
                      <Compass className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-400 block uppercase tracking-wider font-semibold">
                        {isBn ? 'ডিভাইস জিপিএস স্থানাঙ্ক (GPS)' : 'Device GPS Coordinates'}
                      </span>
                      <span className="font-mono text-xs text-slate-200 font-semibold truncate block">
                        {deviceLat.toFixed(5)}, {deviceLng.toFixed(5)}
                      </span>
                    </div>
                  </div>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleCopyDeviceCoords}
                    className="h-7 text-xs bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700 hover:text-white"
                  >
                    {copiedDevice ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400 mr-1" />
                        <span>{isBn ? 'কপি হয়েছে' : 'Copied'}</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 mr-1 text-slate-400" />
                        <span>{isBn ? 'কপি' : 'Copy'}</span>
                      </>
                    )}
                  </Button>
                </div>

                {/* Accuracy & Captured Time Metadata */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Crosshair className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                        {isBn ? 'জিপিএস নির্ভুলতা' : 'GPS Accuracy'}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                        {reporterDeviceLocation?.accuracyMeters !== null &&
                        reporterDeviceLocation?.accuracyMeters !== undefined
                          ? `±${Math.round(reporterDeviceLocation.accuracyMeters)} ${isBn ? 'মিটার' : 'meters'}`
                          : isBn ? 'উপলব্ধ নয়' : 'Not reported'}
                      </span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded bg-indigo-50 dark:bg-indigo-950/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Clock className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] text-slate-500 dark:text-slate-400 block">
                        {isBn ? 'ধারণের সময়' : 'Captured At'}
                      </span>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate block">
                        {formattedCapturedAt || (isBn ? 'উপলব্ধ নয়' : 'Not recorded')}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ComplaintLocationCard;
