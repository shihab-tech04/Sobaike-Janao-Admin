import React from 'react';
import { ThemeProvider } from '@/themes';
import { LanguageProvider } from '@/context/LanguageContext';
import { AuthProvider } from '@/context/AuthContext';
import { NotificationProvider } from '@/context/NotificationContext';
import { AppRoutes } from '@/routes';
import { ErrorBoundary } from '@/components/common';

export const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="system">
        <LanguageProvider>
          <AuthProvider>
            <NotificationProvider>
              <AppRoutes />
            </NotificationProvider>
          </AuthProvider>
        </LanguageProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
};

export default App;
