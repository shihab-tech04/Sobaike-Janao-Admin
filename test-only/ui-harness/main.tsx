import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { LanguageProvider, useLanguage } from '@/context/LanguageContext';
import { NewsIntakePage } from '@/pages/NewsIntake/NewsIntakePage';
import { BannerCmsPage } from '@/pages/Banners/BannerCmsPage';

function FixtureHost() {
  const [pane, setPane] = useState<'news' | 'banners'>('news');
  const { language, setLanguage } = useLanguage();
  return (
    <div className="min-h-screen bg-slate-50 p-4 dark:bg-slate-950">
      <nav aria-label="Synthetic UI harness controls" className="mb-4 flex flex-wrap gap-3">
        <button type="button" onClick={() => setPane('news')} data-testid="harness-news">News Intake</button>
        <button type="button" onClick={() => setPane('banners')} data-testid="harness-banners">Banner CMS</button>
        <button type="button" onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')} data-testid="harness-language">EN/BN</button>
      </nav>
      <main>{pane === 'news' ? <NewsIntakePage /> : <BannerCmsPage />}</main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<LanguageProvider><FixtureHost /></LanguageProvider>);
