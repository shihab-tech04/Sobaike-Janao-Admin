import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import {
  MapContainer,
  LocationSummary,
  MapFilters,
  MapComplaintList,
  MapLegend,
  MapEmptyState,
} from '@/components/map';
import {
  MapComplaint,
  MapDataset,
  MapFilterState,
  MapSummary,
} from '@/types/Map';
import { ComplaintLifecycleStatus } from '@/types/Complaint';
import { mapApi } from '@/services/api/mapApi';
import {
  RefreshCw,
  AlertCircle,
  Info,
  Map as MapIcon,
  List as ListIcon,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '@/utils';

const INITIAL_FILTERS: MapFilterState = {
  searchQuery: '',
  segment: 'all',
  subcategory: 'all',
  status: 'all',
  district: 'all',
  affectedPersonAgeGroup: 'all',
  allegedAbuserRelationship: 'all',
  reportingFor: 'all',
  dateRange: 'all',
};

export const MapPage: React.FC = () => {
  const { language } = useLanguage();
  const isBn = language === 'bn';
  const { hasPermission } = useAuth();
  const canViewComplaints = hasPermission('complaints.view');

  // Data & State
  const [dataset, setDataset] = useState<MapDataset | null>(null);
  const datasetRef = useRef<MapDataset | null>(null);
  datasetRef.current = dataset;

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);

  // Filters & Selection
  const [filters, setFilters] = useState<MapFilterState>(INITIAL_FILTERS);
  const [selectedComplaint, setSelectedComplaint] = useState<MapComplaint | null>(null);

  // Mobile View Switcher: 'map' | 'list'
  const [mobileView, setMobileView] = useState<'map' | 'list'>('map');

  // Load Geospatial Data - stable callback without dataset or language dependencies
  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true);
        setRefreshError(null);
      } else {
        setLoading(true);
        setError(null);
      }

      const data = await mapApi.getMapDataset();
      setDataset(data);
      datasetRef.current = data;
      setError(null);
      setRefreshError(null);
    } catch (err: any) {
      console.error('Failed to load map dataset:', err);
      if (isRefresh && datasetRef.current) {
        setRefreshError('refresh_failed');
      } else {
        setError('load_failed');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Client-Side Filtered Complaints
  const filteredComplaints = useMemo(() => {
    if (!dataset) return [];

    return dataset.complaints.filter((item) => {
      // 1. Search Query
      if (filters.searchQuery.trim()) {
        const q = filters.searchQuery.toLowerCase().trim();
        const idMatch = item.id.toLowerCase().includes(q);
        const titleEnMatch = item.titleEn.toLowerCase().includes(q);
        const titleBnMatch = item.titleBn.toLowerCase().includes(q);
        const addrMatch = item.location.formattedAddress.toLowerCase().includes(q);
        const distMatch = item.location.district.toLowerCase().includes(q);
        const upazilaMatch = item.location.upazilaOrThana.toLowerCase().includes(q);
        const areaMatch = item.location.area.toLowerCase().includes(q);
        const roadMatch = item.location.road.toLowerCase().includes(q);
        const landmarkMatch = item.location.landmark.toLowerCase().includes(q);

        if (
          !idMatch &&
          !titleEnMatch &&
          !titleBnMatch &&
          !addrMatch &&
          !distMatch &&
          !upazilaMatch &&
          !areaMatch &&
          !roadMatch &&
          !landmarkMatch
        ) {
          return false;
        }
      }

      // 2. Segment
      if (filters.segment && filters.segment !== 'all') {
        if (item.segmentId !== filters.segment) return false;
      }

      // 3. Subcategory
      if (filters.subcategory && filters.subcategory !== 'all') {
        if (item.subcategoryId !== filters.subcategory) return false;
      }

      // 4. Harassment Classification
      if (filters.segment === 'harassment') {
        if (filters.affectedPersonAgeGroup !== 'all' && item.affectedPersonAgeGroup !== filters.affectedPersonAgeGroup) return false;
        if (filters.allegedAbuserRelationship !== 'all' && item.allegedAbuserRelationship !== filters.allegedAbuserRelationship) return false;
        if (filters.reportingFor !== 'all' && item.reportingFor !== filters.reportingFor) return false;
      }

      // 5. Status
      if (filters.status && filters.status !== 'all') {
        if (item.status !== filters.status) return false;
      }

      // 6. District
      if (filters.district && filters.district !== 'all') {
        if (
          item.location.district.toLowerCase() !==
          filters.district.toLowerCase()
        ) {
          return false;
        }
      }

      // 7. Date Range
      if (filters.dateRange && filters.dateRange !== 'all') {
        const itemTime = new Date(item.createdAt).getTime();
        const now = Date.now();

        if (filters.dateRange === 'today') {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          if (itemTime < startOfToday.getTime()) return false;
        } else if (filters.dateRange === 'week') {
          const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
          if (itemTime < sevenDaysAgo) return false;
        } else if (filters.dateRange === 'month') {
          const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
          if (itemTime < thirtyDaysAgo) return false;
        }
      }

      return true;
    });
  }, [dataset, filters]);

  // Clear selected complaint if filters remove it from filteredComplaints
  useEffect(() => {
    if (
      selectedComplaint &&
      !filteredComplaints.some((item) => item.id === selectedComplaint.id)
    ) {
      setSelectedComplaint(null);
    }
  }, [filteredComplaints, selectedComplaint]);

  // Computed Summary Metrics
  const summary: MapSummary = useMemo(() => {
    const mappedCount = filteredComplaints.length;
    let submittedCount = 0;
    let publishedCount = 0;
    const districtSet = new Set<string>();

    for (const c of filteredComplaints) {
      if (c.status === 'submitted') submittedCount++;
      if (c.status === 'published') publishedCount++;
      if (c.location.district) districtSet.add(c.location.district);
    }

    return {
      mappedCount,
      submittedCount,
      publishedCount,
      districtsCount: districtSet.size,
    };
  }, [filteredComplaints]);

  // Status breakdown counts for Legend
  const legendCounts = useMemo(() => {
    const counts: Record<ComplaintLifecycleStatus | 'all', number> = {
      all: filteredComplaints.length,
      submitted: 0,
      published: 0,
      unpublished: 0,
      rejected: 0,
      edited: 0,
    };

    for (const c of filteredComplaints) {
      if (counts[c.status] !== undefined) {
        counts[c.status]++;
      }
    }

    return counts;
  }, [filteredComplaints]);

  // Reset Filters Handler
  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  // Status selection from Legend
  const handleLegendStatusSelect = (status: ComplaintLifecycleStatus | 'all') => {
    setFilters((prev) => ({ ...prev, status }));
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* 1. Page Header */}
      <PageHeader
        title={isBn ? 'মানচিত্র পর্যবেক্ষণ' : 'Map Monitoring'}
        description={
          isBn
            ? 'লাইভ ভৌগোলিক পর্যবেক্ষণ ও অভিযোগের আঞ্চলিক বিস্তার'
            : 'Live geospatial intelligence and geographic complaint distribution'
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => loadData(true)}
              disabled={loading || refreshing}
              leftIcon={
                <RefreshCw
                  className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')}
                />
              }
            >
              {isBn ? 'রিফ্রেশ' : 'Refresh'}
            </Button>
          </div>
        }
      />

      {/* 2. Error State: If initial load fails and NO dataset exists */}
      {!loading && error && !dataset ? (
        <div className="p-8 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex flex-col items-center justify-center text-center gap-3">
          <AlertCircle className="w-8 h-8 text-rose-600 dark:text-rose-400 shrink-0" />
          <div>
            <h3 className="text-sm font-semibold text-rose-900 dark:text-rose-200 mb-1">
              {isBn ? 'ম্যাপের তথ্য লোড করা যায়নি।' : 'Map data could not be loaded.'}
            </h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 max-w-md">
              {isBn
                ? 'অনুগ্রহ করে আপনার ইন্টারনেট বা সার্ভার সংযোগ পরীক্ষা করে পুনরায় চেষ্টা করুন।'
                : 'Please verify your internet or server connection and try again.'}
            </p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => loadData(false)}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            {isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}
          </Button>
        </div>
      ) : loading && !dataset ? (
        /* 3. Initial Loading Skeleton */
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-24 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse"
              />
            ))}
          </div>
          <div className="h-16 bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            <div className="lg:col-span-8 h-[500px] sm:h-[560px] lg:h-[640px] bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse flex items-center justify-center text-slate-400 text-xs">
              {isBn ? 'মানচিত্র লোড হচ্ছে...' : 'Loading map intelligence...'}
            </div>
            <div className="lg:col-span-4 h-[500px] sm:h-[560px] lg:h-[640px] bg-slate-100 dark:bg-slate-800/60 rounded-xl animate-pulse" />
          </div>
        </div>
      ) : (
        /* 4. Connected Real Map View when valid dataset exists */
        dataset && (
          <>
            {/* Non-destructive Refresh Error Banner if refresh failed */}
            {refreshError && (
              <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 flex items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5 text-xs text-rose-800 dark:text-rose-200">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                  <span>
                    {isBn
                      ? 'সর্বশেষ তথ্যে রিফ্রেশ করা যায়নি। পূর্ববর্তী সক্রিয় তথ্য প্রদর্শিত হচ্ছে।'
                      : 'Could not refresh latest map data. Displaying previously loaded dataset.'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => loadData(true)}
                    className="text-xs h-7 px-2.5"
                  >
                    {isBn ? 'পুনরায় রিফ্রেশ' : 'Retry Refresh'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setRefreshError(null)}
                    className="text-xs h-7 px-2"
                  >
                    {isBn ? 'বাতিল' : 'Dismiss'}
                  </Button>
                </div>
              </div>
            )}

            {/* Unmapped Complaints Notice Banner */}
            {dataset.unmappedCount > 0 && (
              <div className="bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-900/60 rounded-xl p-3.5 flex items-start gap-3 shadow-2xs">
                <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900 dark:text-amber-200 space-y-0.5">
                  <p className="font-semibold">
                    {isBn
                      ? `বৈধ স্থানাঙ্ক না থাকায় ${dataset.unmappedCount}টি অভিযোগ ম্যাপে দেখানো হয়নি।`
                      : `${dataset.unmappedCount} complaints are not shown on the map because valid coordinates are unavailable.`}
                  </p>
                  <p className="text-amber-700 dark:text-amber-300/90">
                    {canViewComplaints
                      ? (isBn
                          ? 'এসব অভিযোগের তালিকা ও বিস্তারিত মূল অভিযোগ ব্যবস্থাপনা পেজ থেকে পর্যবেক্ষণ করা যাবে।'
                          : 'These unmapped records remain accessible in the Complaints Workspace.')
                      : (isBn
                          ? 'বৈধ স্থানাঙ্ক না থাকার কারণে এই রেকর্ডগুলো মানচিত্রে প্রদর্শিত হচ্ছে না।'
                          : 'These records are not shown on the map because valid coordinates are unavailable.')}
                  </p>
                </div>
              </div>
            )}

            {/* Unsupported Status Notice Banner */}
            {dataset.unsupportedStatusCount > 0 && (
              <div className="bg-slate-50/90 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 flex items-start gap-3 shadow-2xs">
                <Info className="w-5 h-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" />
                <div className="text-xs text-slate-700 dark:text-slate-300 space-y-0.5">
                  <p className="font-medium">
                    {isBn
                      ? `বর্তমান স্ট্যাটাস ম্যাপ মনিটরিংয়ে সমর্থিত নয় বলে ${dataset.unsupportedStatusCount}টি অভিযোগ দেখানো হয়নি।`
                      : `${dataset.unsupportedStatusCount} complaints are not shown because their current status is not supported by Map Monitoring.`}
                  </p>
                </div>
              </div>
            )}

            {/* Summary KPI Cards */}
            <LocationSummary summary={summary} loading={refreshing} />

            {/* Filters Toolbar */}
            <MapFilters
              filters={filters}
              onChange={setFilters}
              onReset={handleResetFilters}
              segments={dataset.segments}
              subcategories={dataset.subcategories}
              districts={dataset.districts}
              totalResultsCount={filteredComplaints.length}
            />

            {/* Mobile Tab View Switcher (< lg) */}
            <div className="lg:hidden flex items-center justify-center p-1 bg-slate-100 dark:bg-slate-800 rounded-lg max-w-xs mx-auto border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setMobileView('map')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-all',
                  mobileView === 'map'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                <MapIcon className="w-3.5 h-3.5" />
                <span>{isBn ? 'মানচিত্র ভিউ' : 'Map View'}</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className={cn(
                  'flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-md text-xs font-medium transition-all',
                  mobileView === 'list'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                <ListIcon className="w-3.5 h-3.5" />
                <span>{isBn ? 'তালিকা ভিউ' : 'List View'}</span>
                <span className="text-[10px] font-mono px-1 rounded bg-slate-200 dark:bg-slate-700">
                  {filteredComplaints.length}
                </span>
              </button>
            </div>

            {/* Main Interactive Geospatial View / Empty States */}
            {dataset.totalSourceCount === 0 ? (
              <MapEmptyState type="no-data" />
            ) : dataset.complaints.length === 0 ? (
              <MapEmptyState
                type="no-coords"
                unmappedCount={dataset.unmappedCount}
              />
            ) : filteredComplaints.length === 0 ? (
              <MapEmptyState
                type="no-match"
                onResetFilters={handleResetFilters}
              />
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
                {/* Left Column: Map + Legend */}
                <div
                  className={cn(
                    'lg:col-span-8 space-y-3',
                    mobileView === 'list' ? 'hidden lg:block' : 'block'
                  )}
                >
                  <MapContainer
                    complaints={filteredComplaints}
                    selectedComplaint={selectedComplaint}
                    onSelectComplaint={setSelectedComplaint}
                    loading={refreshing}
                  />

                  <MapLegend
                    selectedStatus={filters.status}
                    onSelectStatus={handleLegendStatusSelect}
                    counts={legendCounts}
                  />
                </div>

                {/* Right Column: Complaint List */}
                <div
                  className={cn(
                    'lg:col-span-4',
                    mobileView === 'map' ? 'hidden lg:block' : 'block'
                  )}
                >
                  <MapComplaintList
                    complaints={filteredComplaints}
                    selectedId={selectedComplaint?.id || null}
                    onSelectComplaint={(item) => {
                      setSelectedComplaint(item);
                      // On mobile, switch to map view upon selecting an item
                      if (window.innerWidth < 1024) {
                        setMobileView('map');
                      }
                    }}
                  />
                </div>
              </div>
            )}
          </>
        )
      )}
    </div>
  );
};

export default MapPage;
