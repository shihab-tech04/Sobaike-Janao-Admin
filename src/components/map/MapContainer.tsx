import React, { useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapContainer as LeafletMapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
} from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { MapComplaint } from '@/types/Map';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/themes/ThemeProvider';
import { useAuth } from '@/context/AuthContext';
import { Badge, BadgeStatus } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import {
  ZoomIn,
  ZoomOut,
  Compass,
  MapPin,
  ExternalLink,
  X,
  Calendar,
  Layers,
  Folder,
} from 'lucide-react';
import { cn } from '@/utils';

export interface MapContainerProps {
  complaints: MapComplaint[];
  selectedComplaint: MapComplaint | null;
  onSelectComplaint: (complaint: MapComplaint | null) => void;
  loading?: boolean;
  className?: string;
}

// Default center of Bangladesh for neutral viewport
const BANGLADESH_CENTER: [number, number] = [23.685, 90.3563];
const DEFAULT_ZOOM = 7;

/**
 * Internal Map Controller to manage flyTo, fitBounds, and selected complaint synchronization
 */
const MapViewController: React.FC<{
  complaints: MapComplaint[];
  selectedComplaint: MapComplaint | null;
}> = ({ complaints, selectedComplaint }) => {
  const map = useMap();
  const prevSelectedIdRef = useRef<string | null>(null);
  const prevSignatureRef = useRef<string>('');

  const complaintsSignature = useMemo(
    () => complaints.map((item) => `${item.id}:${item.latitude}:${item.longitude}`).join('|'),
    [complaints]
  );

  // Synchronize when the list or coordinates of filtered complaints change
  useEffect(() => {
    if (complaints.length === 0) {
      prevSignatureRef.current = '';
      return;
    }

    // Only auto-fit/fly if the dataset signature actually changed
    if (prevSignatureRef.current !== complaintsSignature) {
      prevSignatureRef.current = complaintsSignature;

      // Priority: If a complaint is currently selected and remains in the filtered results, preserve focus on it
      const isSelectedInResults =
        selectedComplaint && complaints.some((c) => c.id === selectedComplaint.id);

      if (isSelectedInResults && selectedComplaint) {
        map.flyTo(
          [selectedComplaint.latitude, selectedComplaint.longitude],
          Math.max(map.getZoom(), 14),
          { duration: 0.8 }
        );
      } else {
        if (complaints.length === 1) {
          map.flyTo([complaints[0].latitude, complaints[0].longitude], 14, {
            duration: 0.8,
          });
        } else {
          const bounds = L.latLngBounds(
            complaints.map((c) => [c.latitude, c.longitude])
          );
          if (bounds.isValid()) {
            map.fitBounds(bounds, {
              padding: [45, 45],
              maxZoom: 15,
            });
          }
        }
      }
    }
  }, [complaints, complaintsSignature, map, selectedComplaint]);

  // Synchronize when a specific complaint is selected from the list or marker
  useEffect(() => {
    if (selectedComplaint && selectedComplaint.id !== prevSelectedIdRef.current) {
      prevSelectedIdRef.current = selectedComplaint.id;
      map.flyTo(
        [selectedComplaint.latitude, selectedComplaint.longitude],
        Math.max(map.getZoom(), 14),
        { duration: 0.8 }
      );
    } else if (!selectedComplaint) {
      prevSelectedIdRef.current = null;
    }
  }, [selectedComplaint, map]);

  return null;
};

/**
 * Custom Map Controls component using useMap()
 */
const MapCustomControls: React.FC<{
  complaints: MapComplaint[];
  isBn: boolean;
}> = ({ complaints, isBn }) => {
  const map = useMap();

  const handleZoomIn = () => map.zoomIn();
  const handleZoomOut = () => map.zoomOut();
  const handleResetView = () => {
    if (complaints.length === 0) {
      map.setView(BANGLADESH_CENTER, DEFAULT_ZOOM);
    } else if (complaints.length === 1) {
      map.flyTo([complaints[0].latitude, complaints[0].longitude], 14);
    } else {
      const bounds = L.latLngBounds(
        complaints.map((c) => [c.latitude, c.longitude])
      );
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
      }
    }
  };

  return (
    <div className="absolute top-3 right-3 z-[1000] flex items-center gap-1.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-lg p-1 shadow-md">
      <button
        type="button"
        onClick={handleZoomIn}
        className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={isBn ? 'জুম ইন' : 'Zoom In (+)'}
        aria-label={isBn ? 'জুম ইন' : 'Zoom In'}
      >
        <ZoomIn className="w-4 h-4" />
      </button>
      <button
        type="button"
        onClick={handleZoomOut}
        className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={isBn ? 'জুম আউট' : 'Zoom Out (-)'}
        aria-label={isBn ? 'জুম আউট' : 'Zoom Out'}
      >
        <ZoomOut className="w-4 h-4" />
      </button>
      <div className="w-px h-3.5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
      <button
        type="button"
        onClick={handleResetView}
        className="p-1.5 rounded text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        title={isBn ? 'ভিউ রিসেট' : 'Reset View'}
        aria-label={isBn ? 'ভিউ রিসেট' : 'Reset View'}
      >
        <Compass className="w-4 h-4" />
      </button>
    </div>
  );
};

export const MapContainer: React.FC<MapContainerProps> = ({
  complaints,
  selectedComplaint,
  onSelectComplaint,
  loading = false,
  className,
}) => {
  const { language } = useLanguage();
  const { resolvedTheme } = useTheme();
  const { hasPermission } = useAuth();
  const canViewComplaints = hasPermission('complaints.view');
  const isDark = resolvedTheme === 'dark';
  const isBn = language === 'bn';
  const navigate = useNavigate();

  // Status Color Helper
  const getStatusColor = (status: MapComplaint['status']) => {
    switch (status) {
      case 'submitted':
        return '#f59e0b'; // amber-500
      case 'published':
        return '#0ea5e9'; // sky-500
      case 'unpublished':
        return '#64748b'; // slate-500
      case 'rejected':
        return '#ef4444'; // rose-500
      case 'edited':
        return '#8b5cf6'; // violet-500
      default:
        return '#64748b';
    }
  };

  const getStatusBadge = (status: MapComplaint['status']) => {
    const map: Record<
      MapComplaint['status'],
      { badgeStatus: BadgeStatus; labelEn: string; labelBn: string }
    > = {
      submitted: { badgeStatus: 'pending', labelEn: 'Submitted', labelBn: 'দাখিলকৃত' },
      published: { badgeStatus: 'published', labelEn: 'Published', labelBn: 'প্রকাশিত' },
      unpublished: { badgeStatus: 'default', labelEn: 'Unpublished', labelBn: 'অপ্রকাশিত' },
      rejected: { badgeStatus: 'rejected', labelEn: 'Rejected', labelBn: 'বাতিলকৃত' },
      edited: { badgeStatus: 'info', labelEn: 'Edited', labelBn: 'সম্পাদিত' },
    };

    const cfg = map[status] || { badgeStatus: 'default', labelEn: status, labelBn: status };
    return (
      <Badge status={cfg.badgeStatus} size="sm">
        {isBn ? cfg.labelBn : cfg.labelEn}
      </Badge>
    );
  };

  const formatLocationDisplay = (item: MapComplaint) => {
    const loc = item.location;
    if (loc.formattedAddress) return loc.formattedAddress;
    const parts = [loc.area, loc.road, loc.upazilaOrThana, loc.district, loc.division].filter(
      Boolean
    );
    return parts.length > 0 ? parts.join(', ') : isBn ? 'অবস্থান অনুল্লিখিত' : 'Location not specified';
  };

  return (
    <div
      className={cn(
        'relative bg-slate-100 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col',
        'h-[500px] sm:h-[560px] lg:h-[640px]',
        className
      )}
    >
      {/* Top Left Stats Badge */}
      <div className="absolute top-3 left-3 z-[1000] flex items-center gap-2 pointer-events-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-700 dark:text-slate-200 shadow-md">
        <MapPin className="w-3.5 h-3.5 text-sky-500" />
        <span className="font-mono font-semibold">
          {complaints.length}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          {isBn ? 'পয়েন্ট ম্যাপে দৃশ্যমান' : 'Mapped Points'}
        </span>
      </div>

      {/* Leaflet Map */}
      <LeafletMapContainer
        center={BANGLADESH_CENTER}
        zoom={DEFAULT_ZOOM}
        zoomControl={false}
        className="w-full h-full z-0 outline-none"
        style={{ width: '100%', height: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />

        {/* View Controller */}
        <MapViewController
          complaints={complaints}
          selectedComplaint={selectedComplaint}
        />

        {/* Top Right Controls */}
        <MapCustomControls complaints={complaints} isBn={isBn} />

        {/* Circle Markers */}
        {complaints.map((item) => {
          const isSelected = selectedComplaint?.id === item.id;
          const color = getStatusColor(item.status);

          return (
            <CircleMarker
              key={item.id}
              center={[item.latitude, item.longitude]}
              radius={isSelected ? 10 : 7}
              pathOptions={{
                color: isSelected ? '#ffffff' : color,
                weight: isSelected ? 3 : 2,
                fillColor: color,
                fillOpacity: isSelected ? 1 : 0.85,
              }}
              eventHandlers={{
                click: () => {
                  onSelectComplaint(isSelected ? null : item);
                },
              }}
            >
              <Popup className="custom-map-popup">
                <div className="p-1 min-w-[220px] max-w-[280px] text-left text-slate-800 dark:text-slate-100">
                  <div className="flex items-center justify-between gap-1.5 mb-1 pb-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
                      #{item.id}
                    </span>
                    <div>{getStatusBadge(item.status)}</div>
                  </div>

                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 line-clamp-2 mb-1">
                    {isBn ? item.titleBn : item.titleEn}
                  </h4>

                  <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 mb-1">
                    <Folder className="w-3 h-3 shrink-0 text-slate-400" />
                    <span className="truncate">
                      {(isBn ? item.segmentBn : item.segmentEn) || '—'}
                      {(isBn ? item.subcategoryBn : item.subcategoryEn)
                        ? ` • ${isBn ? item.subcategoryBn : item.subcategoryEn}`
                        : ''}
                    </span>
                  </div>

                  <div className="flex items-start gap-1 text-[11px] text-slate-600 dark:text-slate-300 mb-2">
                    <MapPin className="w-3 h-3 text-sky-500 shrink-0 mt-0.5" />
                    <span className="line-clamp-2">
                      {formatLocationDisplay(item)}
                    </span>
                  </div>

                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between gap-1">
                    <span className="text-[10px] text-slate-400 font-mono">
                      {new Date(item.createdAt).toLocaleDateString(isBn ? 'bn-BD' : 'en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                    {canViewComplaints && (
                      <button
                        type="button"
                        onClick={() => navigate(`/complaints/${item.id}`)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded transition-colors"
                        aria-label={isBn ? `অভিযোগ #${item.id}-এর বিস্তারিত দেখুন` : `Open details for #${item.id}`}
                      >
                        <span>{isBn ? 'বিস্তারিত' : 'Open'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      </LeafletMapContainer>

      {/* Selected Complaint Floating Bottom Card */}
      {selectedComplaint && (
        <div className="absolute bottom-3 left-3 right-3 sm:right-auto sm:max-w-md bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 shadow-xl z-[1000] text-left animate-in fade-in slide-in-from-bottom-2 duration-200">
          {/* Header Row: ID, Close, Status */}
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-mono font-bold text-sky-600 dark:text-sky-400">
                #{selectedComplaint.id}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {getStatusBadge(selectedComplaint.status)}
              <button
                type="button"
                onClick={() => onSelectComplaint(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Title */}
          <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1 leading-snug line-clamp-2">
            {isBn ? selectedComplaint.titleBn : selectedComplaint.titleEn}
          </h4>

          {/* Location & Taxonomy metadata */}
          <div className="grid grid-cols-2 gap-2 text-xs py-1.5 border-t border-slate-100 dark:border-slate-800 text-slate-600 dark:text-slate-300">
            <div>
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
                {isBn ? 'বিভাগ / উপ-শ্রেণি:' : 'Segment / Sub:'}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
                {(isBn ? selectedComplaint.segmentBn : selectedComplaint.segmentEn) || '—'}
                {(isBn ? selectedComplaint.subcategoryBn : selectedComplaint.subcategoryEn)
                  ? ` / ${isBn ? selectedComplaint.subcategoryBn : selectedComplaint.subcategoryEn}`
                  : ''}
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 block uppercase tracking-wider">
                {isBn ? 'জেলা:' : 'District:'}
              </span>
              <span className="font-medium text-slate-800 dark:text-slate-200 truncate block">
                {selectedComplaint.location.district || (isBn ? 'অনুল্লিখিত' : 'N/A')}
              </span>
            </div>
          </div>

          {/* Address full line */}
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-start gap-1.5 pt-1.5 border-t border-slate-100 dark:border-slate-800/60 mb-2.5">
            <MapPin className="w-3.5 h-3.5 text-sky-500 shrink-0 mt-0.5" />
            <span className="line-clamp-2">
              {formatLocationDisplay(selectedComplaint)}
            </span>
          </div>

          {/* Action Row */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
              <Calendar className="w-3 h-3 text-slate-400" />
              <span>
                {new Date(selectedComplaint.createdAt).toLocaleDateString(
                  isBn ? 'bn-BD' : 'en-US',
                  {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }
                )}
              </span>
            </div>

            {canViewComplaints && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/complaints/${selectedComplaint.id}`)}
                rightIcon={<ExternalLink className="w-3.5 h-3.5" />}
                className="h-7 text-xs px-3"
              >
                {isBn ? 'অভিযোগ খুলুন' : 'Open Complaint'}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapContainer;
