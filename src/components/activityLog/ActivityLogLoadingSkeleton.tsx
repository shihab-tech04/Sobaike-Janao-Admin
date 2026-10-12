import React from 'react';

export const ActivityLogLoadingSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse" id="activity-log-loading-skeleton">
      {/* Filters bar skeleton */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
          <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg" />
        </div>
      </div>

      {/* Table skeleton */}
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
        <div className="h-12 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800" />
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-8 h-8 rounded-lg bg-slate-200 dark:bg-slate-800 shrink-0" />
                <div className="space-y-2 flex-1 max-w-md">
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-sm w-3/4" />
                  <div className="h-3 bg-slate-100 dark:bg-slate-800/60 rounded-sm w-1/2" />
                </div>
              </div>
              <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-md w-24 hidden sm:block" />
              <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded-sm w-32 hidden md:block" />
              <div className="h-8 bg-slate-200 dark:bg-slate-800 rounded-md w-16" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
