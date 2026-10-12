import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TaxonomySegment,
  TaxonomySubcategory,
  TaxonomySegmentNode,
  TaxonomyFilterState,
  TaxonomyStats,
} from '@/types/Category';
import { categoryApi, TaxonomyBundle } from '@/services/api';
import { useLanguage } from '@/context/LanguageContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import {
  CategoryFilters,
  SegmentTabs,
  TaxonomyTree,
  CategoryDetailDrawer,
  CategoryEmptyState,
  DetailDrawerTarget,
} from '@/components/categories';
import {
  RefreshCw,
  Layers,
  Tag,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { cn } from '@/utils';

const INITIAL_FILTERS: TaxonomyFilterState = {
  search: '',
  status: 'all',
  segmentId: 'all',
};

const EMPTY_STATS: TaxonomyStats = {
  segments: 0,
  subcategories: 0,
  activeItems: 0,
};

export const CategoriesPage: React.FC = () => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  // Loaded taxonomy data bundle from Supabase (loaded once on mount/refresh)
  const [taxonomyBundle, setTaxonomyBundle] = useState<TaxonomyBundle | null>(null);

  // UI / Interaction states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters (applied locally in-memory via useMemo)
  const [filters, setFilters] = useState<TaxonomyFilterState>(INITIAL_FILTERS);

  // Detail Drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [drawerTarget, setDrawerTarget] = useState<DetailDrawerTarget | null>(null);

  /**
   * Load taxonomy data from Supabase (runs on mount and on manual refresh only)
   */
  const loadTaxonomyData = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const bundle = await categoryApi.getTaxonomy();
      setTaxonomyBundle(bundle);
    } catch (err: any) {
      console.error('Failed to load taxonomy data:', err);
      setError(err.message || 'Failed to load taxonomy');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadTaxonomyData();
  }, [loadTaxonomyData]);

  const handleRefresh = () => {
    loadTaxonomyData(true);
  };

  const handleFilterChange = (newFilters: TaxonomyFilterState) => {
    setFilters(newFilters);
  };

  const handleResetFilters = () => {
    setFilters(INITIAL_FILTERS);
  };

  const handleSelectSegmentTab = (segmentId: string) => {
    setFilters((prev) => ({
      ...prev,
      segmentId,
    }));
  };

  const handleInspectSegment = (segment: TaxonomySegmentNode) => {
    setDrawerTarget({ type: 'segment', data: segment });
    setIsDrawerOpen(true);
  };

  const handleInspectSubcategory = (
    subcategory: TaxonomySubcategory,
    parentSegment: TaxonomySegment
  ) => {
    setDrawerTarget({
      type: 'subcategory',
      data: subcategory,
      parentSegment,
    });
    setIsDrawerOpen(true);
  };

  const handleCloseDrawer = () => {
    setIsDrawerOpen(false);
    setDrawerTarget(null);
  };

  // Client-side filtering via useMemo without querying Supabase on filter changes
  const filteredTree = useMemo(() => {
    if (!taxonomyBundle) return [];
    const { fullTree } = taxonomyBundle;
    const searchQuery = filters.search.trim().toLowerCase();
    const { status, segmentId } = filters;

    return fullTree
      .filter((seg) => {
        // Segment ID filter
        if (segmentId !== 'all' && seg.id !== segmentId) {
          return false;
        }

        // Status filter: match segment status or if any subcategory matches status
        if (status !== 'all') {
          const segMatch = seg.status === status;
          const hasMatchingSub = seg.subcategories.some((s) => s.status === status);
          if (!segMatch && !hasMatchingSub) {
            return false;
          }
        }

        // Search filter: match segment names or subcategory names
        if (searchQuery) {
          const segNameEnMatch = seg.nameEn.toLowerCase().includes(searchQuery);
          const segNameBnMatch = seg.nameBn.toLowerCase().includes(searchQuery);
          const segIdMatch = seg.id.toLowerCase().includes(searchQuery);
          const subMatch = seg.subcategories.some(
            (s) =>
              s.nameEn.toLowerCase().includes(searchQuery) ||
              s.nameBn.toLowerCase().includes(searchQuery) ||
              s.id.toLowerCase().includes(searchQuery)
          );

          if (!segNameEnMatch && !segNameBnMatch && !segIdMatch && !subMatch) {
            return false;
          }
        }

        return true;
      })
      .map((seg) => {
        let filteredSubs = seg.subcategories;

        if (status !== 'all') {
          filteredSubs = filteredSubs.filter((s) => s.status === status);
        }

        if (searchQuery) {
          const segMatchesSearch =
            seg.nameEn.toLowerCase().includes(searchQuery) ||
            seg.nameBn.toLowerCase().includes(searchQuery) ||
            seg.id.toLowerCase().includes(searchQuery);

          // If segment itself matched search, show all filtered subs, otherwise filter subs
          if (!segMatchesSearch) {
            filteredSubs = filteredSubs.filter(
              (s) =>
                s.nameEn.toLowerCase().includes(searchQuery) ||
                s.nameBn.toLowerCase().includes(searchQuery) ||
                s.id.toLowerCase().includes(searchQuery)
            );
          }
        }

        return {
          ...seg,
          subcategories: filteredSubs,
        };
      });
  }, [taxonomyBundle, filters]);

  const stats = taxonomyBundle?.stats || EMPTY_STATS;
  const allSegments = taxonomyBundle?.segments || [];
  const fullTree = taxonomyBundle?.fullTree || [];

  const isFiltered = Boolean(
    filters.search ||
    filters.status !== 'all' ||
    filters.segmentId !== 'all'
  );

  return (
    <div className="space-y-6 pb-12">
      {/* Page Header */}
      <PageHeader
        title={isBn ? 'ক্যাটাগরি' : 'Categories'}
        description={
          isBn
            ? 'পাবলিক রিপোর্টিং ফ্লোতে ব্যবহৃত শ্রেণিবিন্যাস দেখুন।'
            : 'View the report taxonomy used by the public reporting flow.'
        }
        actions={
          <Button
            id="refresh-taxonomy-btn"
            variant="secondary"
            size="sm"
            onClick={handleRefresh}
            isLoading={refreshing}
            leftIcon={<RefreshCw className={cn('w-3.5 h-3.5', refreshing && 'animate-spin')} />}
            aria-label="Refresh taxonomy"
          >
            {isBn ? 'রিফ্রেশ' : 'Refresh'}
          </Button>
        }
      />

      {/* Summary Metrics Cards (3 Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Segments */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isBn ? 'বিভাগ' : 'Segments'}
              </p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {stats.segments}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isBn ? 'মূল রিপোর্টিং বিভাগ' : 'Primary report segments'}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200/80 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <Layers className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 2: Subcategories */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isBn ? 'সাব-ক্যাটাগরি' : 'Subcategories'}
              </p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {stats.subcategories}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isBn ? 'নির্দিষ্ট অভিযোগের ধরণ' : 'Specific complaint types'}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200/80 dark:border-sky-800 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
              <Tag className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>

        {/* Card 3: Active Taxonomy Items */}
        <Card className="border border-slate-200 dark:border-slate-800 shadow-xs">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {isBn ? 'সক্রিয় আইটেম' : 'Active Items'}
              </p>
              <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                {stats.activeItems}
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {isBn ? 'সক্রিয় বিভাগ ও সাব-ক্যাটাগরি' : 'Active segments and subcategories'}
              </p>
            </div>
            <div className="w-11 h-11 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200/80 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <CheckCircle2 className="w-5 h-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Segment Navigation Tabs (Always receives full real taxonomy to stay stable during filtering) */}
      <SegmentTabs
        segments={fullTree}
        selectedSegmentId={filters.segmentId}
        onSelectSegment={handleSelectSegmentTab}
        totalItemsCount={stats.segments}
      />

      {/* Filter & Search Bar */}
      <CategoryFilters
        filters={filters}
        onChange={handleFilterChange}
        onReset={handleResetFilters}
        segments={allSegments}
        totalResultsCount={filteredTree.length}
      />

      {/* Error State */}
      {error && (
        <div className="p-8 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-900/50 flex items-center justify-center text-rose-600 dark:text-rose-400 mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-rose-900 dark:text-rose-200">
            {isBn
              ? 'শ্রেণিবিন্যাসের তথ্য লোড করা যায়নি।'
              : 'Taxonomy could not be loaded.'}
          </h3>
          <p className="text-sm text-rose-700 dark:text-rose-300 max-w-md mx-auto">
            {isBn
              ? 'সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
              : 'Check your connection and try again.'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadTaxonomyData()}
            leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
            className="mt-2 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200"
          >
            {isBn ? 'আবার চেষ্টা করুন' : 'Retry'}
          </Button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !error && (
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-44 rounded-2xl bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800"
            />
          ))}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredTree.length === 0 && (
        <CategoryEmptyState
          isFiltered={isFiltered}
          onResetFilters={handleResetFilters}
        />
      )}

      {/* Primary Taxonomy Hierarchy View */}
      {!loading && !error && filteredTree.length > 0 && (
        <TaxonomyTree
          segments={filteredTree}
          onInspectSegment={handleInspectSegment}
          onInspectSubcategory={handleInspectSubcategory}
        />
      )}

      {/* Read-Only Detail Drawer */}
      <CategoryDetailDrawer
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
        target={drawerTarget}
        onUpdated={() => loadTaxonomyData(true)}
      />
    </div>
  );
};

export default CategoriesPage;
