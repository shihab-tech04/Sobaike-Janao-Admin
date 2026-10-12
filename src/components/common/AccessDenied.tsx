import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Lock, RefreshCw, AlertCircle, LogOut } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';

interface AccessDeniedProps {
  requiredPermission?: string;
  fallbackPath?: string;
  title?: string;
  message?: string;
  isErrorState?: boolean;
}

export const AccessDenied: React.FC<AccessDeniedProps> = ({
  requiredPermission,
  fallbackPath = '/dashboard',
  title,
  message,
  isErrorState = false,
}) => {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const { role, isBootstrapMode, permissions, refreshPermissions, permissionsLoading, logout } = useAuth();
  const isBn = language === 'bn';

  const hasZeroPermissions = !isBootstrapMode && permissions.length === 0;

  const roleName = isBootstrapMode
    ? isBn
      ? 'বুটস্ট্র্যাপ অ্যাডমিনিস্ট্রেটর'
      : 'Bootstrap Administrator'
    : role
    ? (isBn && role.name_bn ? role.name_bn : role.name_en)
    : t.access.noRoleAssigned;

  const handleSignOut = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div id="access-denied-container" className="flex items-center justify-center min-h-[60vh] p-4">
      <Card variant="default" className="max-w-md w-full border-slate-200 dark:border-slate-800 shadow-sm">
        <CardContent className="pt-8 pb-8 px-6 text-center space-y-5">
          <div
            className={`mx-auto w-14 h-14 rounded-full flex items-center justify-center ${
              isErrorState
                ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/40 text-amber-600 dark:text-amber-400'
                : 'bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-600 dark:text-rose-400'
            }`}
          >
            {isErrorState ? <AlertCircle className="w-7 h-7" /> : <ShieldAlert className="w-7 h-7" />}
          </div>

          <div className="space-y-2">
            <h2 id="access-denied-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              {title ||
                (isErrorState
                  ? isBn
                    ? 'অনুমতি যাচাই ব্যর্থ হয়েছে'
                    : 'Authorization Verification Failed'
                  : hasZeroPermissions
                  ? isBn
                    ? 'কোনো অনুমতি বরাদ্দ নেই'
                    : 'No Permissions Assigned'
                  : t.access.restrictedTitle)}
            </h2>
            <p id="access-denied-desc" className="text-sm text-slate-500 dark:text-slate-400">
              {message ||
                (isErrorState
                  ? isBn
                    ? 'আপনার প্রশাসনিক অ্যাকাউন্টের অনুমতি যাচাই করার সময় সমস্যা হয়েছে। অনুগ্রহ করে পুনরায় চেষ্টা করুন।'
                    : 'We could not securely verify your assigned administrative permissions from the server. Please retry.'
                  : hasZeroPermissions
                  ? isBn
                    ? 'আপনার অ্যাডমিনিস্ট্রেটর অ্যাকাউন্টটি সক্রিয়, তবে বর্তমান ভূমিকায় কোনো মডিউলে প্রবেশের অনুমতি নেই।'
                    : 'Your administrator account is active, but your current role does not grant access to any modules.'
                  : t.access.restrictedDescription)}
            </p>
          </div>

          {/* Context Details */}
          <div className="bg-slate-50 dark:bg-slate-900/60 rounded-lg p-3.5 border border-slate-100 dark:border-slate-800 text-xs space-y-2.5 text-left">
            {requiredPermission && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span>{t.access.requiredPermission}</span>
                </span>
                <Badge variant="subtle" size="sm" className="font-mono text-[11px]">
                  {requiredPermission}
                </Badge>
              </div>
            )}

            <div className="flex items-center justify-between gap-2">
              <span className="text-slate-500 dark:text-slate-400">
                {t.access.assignedRole}
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {roleName}
              </span>
            </div>
          </div>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            {isErrorState && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => refreshPermissions()}
                isLoading={permissionsLoading}
                leftIcon={<RefreshCw className="w-4 h-4" />}
              >
                <span>{isBn ? 'পুনরায় চেষ্টা' : 'Retry Verification'}</span>
              </Button>
            )}
            {!hasZeroPermissions && (
              <Button
                id="access-denied-back-btn"
                variant="primary"
                size="md"
                onClick={() => navigate(fallbackPath)}
                leftIcon={<ArrowLeft className="w-4 h-4" />}
              >
                <span>{t.access.backToDashboard}</span>
              </Button>
            )}
            <Button
              id="access-denied-signout-btn"
              variant={hasZeroPermissions ? 'primary' : 'secondary'}
              size="md"
              onClick={handleSignOut}
              leftIcon={<LogOut className="w-4 h-4" />}
            >
              <span>{t.header.signOut}</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AccessDenied;

