import React from 'react';

export const UserLoadingSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse" id="user-loading-skeleton">
      <div className="h-10 bg-slate-200 dark:bg-slate-800 rounded-lg w-full max-w-sm" />
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="h-6 bg-slate-200 dark:bg-slate-800 rounded-md w-1/4" />
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800/60 rounded-md w-full" />
          ))}
        </div>
      </div>
    </div>
  );
};
