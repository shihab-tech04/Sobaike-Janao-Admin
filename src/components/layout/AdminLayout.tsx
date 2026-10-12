import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { AdminHeader } from './Header';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import { cn } from '@/utils';

export interface AdminLayoutProps {
  children?: React.ReactNode;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({ children }) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const toggleMobileSidebar = () => {
    setMobileSidebarOpen((prev) => !prev);
  };

  const closeMobileSidebar = () => {
    setMobileSidebarOpen(false);
  };

  const toggleCollapseSidebar = () => {
    setIsSidebarCollapsed((prev) => !prev);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans antialiased transition-colors duration-150">
      {/* Reusable Responsive Sidebar */}
      <Sidebar
        isOpen={mobileSidebarOpen}
        onClose={closeMobileSidebar}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={toggleCollapseSidebar}
      />

      {/* Main Container Area with Dynamic Padding for Sidebar */}
      <div
        className={cn(
          'flex-1 flex flex-col min-h-screen w-full max-w-full overflow-x-clip transition-all duration-200 ease-in-out',
          isSidebarCollapsed ? 'lg:pl-20' : 'lg:pl-64'
        )}
      >
        {/* Reusable Header */}
        <AdminHeader
          onToggleSidebar={toggleMobileSidebar}
          isSidebarCollapsed={isSidebarCollapsed}
          onToggleCollapse={toggleCollapseSidebar}
        />

        {/* Page Main Content Area */}
        <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col min-w-0">
          <ErrorBoundary>
            {children || <Outlet />}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
