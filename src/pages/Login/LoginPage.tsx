import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Shield, Lock, Mail, AlertCircle, ArrowRight, CheckCircle2, Moon, Sun } from 'lucide-react';
import { Button, Input, Checkbox } from '@/components/ui';
import { authService } from '@/services/auth/authService';
import { useAuth } from '@/context/AuthContext';
import { useLanguage } from '@/context/LanguageContext';
import { useTheme } from '@/themes';

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const { language, setLanguage } = useLanguage();
  const { resolvedTheme, toggleTheme } = useTheme();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string; general?: string }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);

  // Initialize remembered email on mount if existing
  useEffect(() => {
    const remembered = authService.getRememberedUser();
    if (remembered) {
      setEmail(remembered);
      setRememberMe(true);
    }
  }, []);

  const validateForm = (): boolean => {
    const newErrors: { email?: string; password?: string; general?: string } = {};

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      newErrors.email = language === 'bn' ? 'ইমেল প্রয়োজন' : 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
      newErrors.email = language === 'bn' ? 'একটি কার্যকর ইমেল দিন' : 'Please enter a valid email address';
    }

    if (!password) {
      newErrors.password = language === 'bn' ? 'পাসওয়ার্ড প্রয়োজন' : 'Password is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      const response = await login({
        email: email.trim(),
        password,
        rememberMe,
      });

      if (response.success) {
        setLoginSuccess(true);
        setTimeout(() => {
          const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';
          navigate(from, { replace: true });
        }, 500);
      } else {
        if (response.isUnauthorizedAdmin) {
          setErrors({
            general:
              language === 'bn'
                ? 'অননুমোদিত: আপনার অ্যাকাউন্টে সক্রিয় প্রশাসনিক সুবিধা নেই।'
                : 'Unauthorized: Your account does not have active administrative privileges.',
          });
        } else if (response.isUnconfigured) {
          setErrors({
            general:
              language === 'bn'
                ? 'সুপাবেস প্রমাণীকরণ এখনও কনফিগার করা হয়নি (VITE_SUPABASE_URL এবং VITE_SUPABASE_PUBLISHABLE_KEY প্রয়োজন)।'
                : 'Supabase authentication is not configured yet. Please configure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY.',
          });
        } else {
          setErrors({
            general:
              language === 'bn'
                ? 'ভুল ইমেল বা পাসওয়ার্ড'
                : response.error || 'Invalid email or password',
          });
        }
      }
    } catch {
      setErrors({
        general:
          language === 'bn'
            ? 'সার্ভার ত্রুটি। অনুগ্রহ করে আবার চেষ্টা করুন।'
            : 'Unable to connect to authentication service. Please try again.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col justify-between bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Utility Bar (Language & Theme toggle) */}
      <header className="w-full max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-600 dark:bg-sky-500 flex items-center justify-center text-white shadow-xs">
            <Shield className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm tracking-tight text-slate-900 dark:text-slate-100">
            Sobai Ke Janao
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <button
            type="button"
            onClick={() => setLanguage(language === 'en' ? 'bn' : 'en')}
            className="px-2.5 py-1 text-xs font-semibold rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title="Switch Language"
          >
            {language === 'en' ? 'বাংলা' : 'English'}
          </button>

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            className="p-1.5 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            title={resolvedTheme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label="Toggle theme"
          >
            {resolvedTheme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Authentication Centered Container */}
      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm p-6 sm:p-8 transition-all">
            {/* Logo + Brand Header */}
            <div className="text-center flex flex-col items-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-600 to-sky-700 dark:from-sky-500 dark:to-sky-600 flex items-center justify-center text-white shadow-md mb-3">
                <Shield className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                Sobai Ke Janao
              </h1>
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-600 dark:text-sky-400 mt-0.5">
                {language === 'bn' ? 'অ্যাডমিন নিয়ন্ত্রণ প্যানেল' : 'Admin Control Panel'}
              </p>
              <h2 className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-3">
                {language === 'bn'
                  ? 'প্রশাসনিক প্যানেলে প্রবেশ করতে আপনার ইমেল ও পাসওয়ার্ড দিন'
                  : 'Welcome back! Please enter your credentials to sign in.'}
              </h2>
            </div>

            {/* General Error Notification */}
            {errors.general && (
              <div className="mb-5 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 flex items-start gap-2.5 text-xs text-red-700 dark:text-red-400">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{errors.general}</span>
              </div>
            )}

            {/* Success Notification */}
            {loginSuccess && (
              <div className="mb-5 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 flex items-center gap-2.5 text-xs text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  {language === 'bn' ? 'সফলভাবে লগইন হয়েছে! ড্যাশবোর্ডে নিয়ে যাওয়া হচ্ছে...' : 'Authenticated successfully! Redirecting to dashboard...'}
                </span>
              </div>
            )}

            {/* Authentication Form */}
            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Email Field */}
              <Input
                id="login-email"
                type="email"
                label={language === 'bn' ? 'ইমেল' : 'Email'}
                placeholder="admin@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errors.email || errors.general) setErrors((prev) => ({ ...prev, email: undefined, general: undefined }));
                }}
                error={errors.email}
                leftIcon={<Mail className="w-4 h-4" />}
                disabled={isLoading || loginSuccess}
                autoComplete="email"
                autoFocus
              />

              {/* Password Field with Show/Hide toggle */}
              <Input
                id="login-password"
                type="password"
                label={language === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errors.password || errors.general) setErrors((prev) => ({ ...prev, password: undefined, general: undefined }));
                }}
                error={errors.password}
                leftIcon={<Lock className="w-4 h-4" />}
                disabled={isLoading || loginSuccess}
                autoComplete="current-password"
              />

              {/* Remember Me Checkbox */}
              <div className="flex items-center justify-between pt-1">
                <Checkbox
                  id="remember-me"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  label={language === 'bn' ? 'মনে রাখুন' : 'Remember me'}
                  disabled={isLoading || loginSuccess}
                />
              </div>

              {/* Login Button */}
              <Button
                type="submit"
                variant="primary"
                size="lg"
                fullWidth
                isLoading={isLoading}
                disabled={isLoading || loginSuccess}
                rightIcon={!isLoading && <ArrowRight className="w-4 h-4" />}
                className="mt-2"
              >
                {isLoading
                  ? language === 'bn'
                    ? 'সাইন ইন হচ্ছে...'
                    : 'Signing in...'
                  : language === 'bn'
                  ? 'লগইন'
                  : 'Login'}
              </Button>
            </form>

            {/* Helper Footer */}
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 text-center">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {language === 'bn'
                  ? 'অননুমোদিত প্রবেশ নিষিদ্ধ। সমস্ত ক্রিয়াকলাপ নিরীক্ষা লগভুক্ত হয়।'
                  : 'Authorized personnel only. All administrative sessions and events are strictly logged.'}
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Bottom Footer Note */}
      <footer className="w-full py-4 text-center text-xs text-slate-500 dark:text-slate-500 border-t border-slate-200/60 dark:border-slate-800/60">
        <span>© {new Date().getFullYear()} Sobai Ke Janao Civic Operations. All rights reserved.</span>
      </footer>
    </div>
  );
};

export default LoginPage;
