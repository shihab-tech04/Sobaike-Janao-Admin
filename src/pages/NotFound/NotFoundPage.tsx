import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { AlertCircle, Home } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();
  const { language } = useLanguage();
  const isBn = language === 'bn';

  return (
    <div className="min-h-[400px] flex flex-col items-center justify-center p-8 text-center">
      <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800/80 flex items-center justify-center text-slate-400 dark:text-slate-500 mb-4">
        <AlertCircle className="w-7 h-7" />
      </div>
      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">
        {isBn ? '৪০৪ — পৃষ্ঠাটি পাওয়া যায়নি' : '404 — Page Not Found'}
      </h1>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mb-6 leading-relaxed">
        {isBn
          ? 'অনুরোধকৃত রুটটি সবাইকে জানাও অ্যাডমিন প্যানেলে বিদ্যমান নেই বা স্থানান্তরিত হয়েছে।'
          : 'The requested route does not exist in the Sobai Ke Janao administrative shell.'}
      </p>
      <Button
        variant="primary"
        size="md"
        leftIcon={<Home className="w-4 h-4" />}
        onClick={() => navigate('/dashboard')}
      >
        {isBn ? 'ড্যাশবোর্ডে ফিরে যান' : 'Return to Dashboard'}
      </Button>
    </div>
  );
};

export default NotFoundPage;
