import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useLanguage } from '@/context/LanguageContext';
import { useAuth } from '@/context/AuthContext';
import { ComplaintMedia } from '@/types/Complaint';
import {
  Image as ImageIcon,
  FileText,
  Video,
  Maximize2,
  Download,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  ZoomIn,
  Lock,
} from 'lucide-react';
import { cn } from '@/utils';

export interface ComplaintMediaViewerProps {
  media: ComplaintMedia[];
  className?: string;
  error?: string | null;
  onRetry?: () => void;
}

export const ComplaintMediaViewer: React.FC<ComplaintMediaViewerProps> = ({
  media = [],
  className,
  error,
  onRetry,
}) => {
  const { language, t } = useLanguage();
  const { hasPermission } = useAuth();
  const isBn = language === 'bn';

  const canViewEvidence = hasPermission('complaints.evidence_view');

  const [activeMediaIndex, setActiveMediaIndex] = useState<number>(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState<boolean>(false);
  const [imageError, setImageError] = useState<Record<string, boolean>>({});

  const hasMedia = media && media.length > 0;
  const currentItem = hasMedia ? media[activeMediaIndex] : null;

  const handleNext = () => {
    if (!hasMedia) return;
    setActiveMediaIndex((prev) => (prev + 1) % media.length);
  };

  const handlePrev = () => {
    if (!hasMedia) return;
    setActiveMediaIndex((prev) => (prev - 1 + media.length) % media.length);
  };

  const handleImageError = (id: string) => {
    setImageError((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <>
      <Card variant="default" className={cn('overflow-hidden', className)}>
        <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ImageIcon className="w-4 h-4 text-sky-600 dark:text-sky-400" />
            <span>{isBn ? 'সংযুক্ত প্রমাণাদি ও মিডিয়া' : 'Evidentiary Attachments & Media'}</span>
          </CardTitle>

          {hasMedia && (
            <Badge variant="subtle" size="sm">
              {isBn
                ? `${media.length} টি ফাইল সংযুক্ত`
                : `${media.length} File${media.length > 1 ? 's' : ''} Attached`}
            </Badge>
          )}
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* 0. Access Restricted State */}
          {!canViewEvidence ? (
            <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-slate-200 dark:border-slate-800 text-center bg-slate-50/70 dark:bg-slate-900/40 space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {t.access.evidenceRestricted}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t.access.evidenceRestrictedDesc}
                </p>
              </div>
              <Badge variant="subtle" size="sm" className="font-mono text-[11px]">
                complaints.evidence_view
              </Badge>
            </div>
          ) : error ? (
            /* 1. Real Evidence Error State */
            <div className="flex flex-col items-center justify-center p-8 rounded-lg border border-amber-200 dark:border-amber-900/40 text-center bg-amber-50/50 dark:bg-amber-950/20 space-y-3">
              <div className="w-12 h-12 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {isBn
                    ? 'প্রমাণের ছবিগুলো লোড করা যায়নি। আবার চেষ্টা করুন।'
                    : 'Evidence images could not be loaded. Please retry.'}
                </p>
                {error && error !== 'Evidence images could not be loaded. Please retry.' && (
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
                    {error}
                  </p>
                )}
              </div>
              {onRetry && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={onRetry}
                  leftIcon={<RotateCcw className="w-3.5 h-3.5" />}
                >
                  <span>{isBn ? 'পুনরায় চেষ্টা করুন' : 'Retry'}</span>
                </Button>
              )}
            </div>
          ) : !hasMedia ? (
            /* 2. Empty / No Evidence State */
            <div className="flex flex-col items-center justify-center p-8 rounded-lg border-2 border-dashed border-slate-200 dark:border-slate-800 text-center bg-slate-50/50 dark:bg-slate-900/40">
              <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-2">
                <ImageIcon className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {isBn ? 'কোনো প্রমাণ সংযুক্ত নেই' : 'No evidence attached'}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm">
                {isBn
                  ? 'এই অভিযোগের সঙ্গে কোনো ফাইল বা মিডিয়া জমা দেওয়া হয়নি।'
                  : 'No files or media were submitted with this complaint.'}
              </p>
            </div>
          ) : (
            /* 3. Media Gallery & Active Preview */
            <div className="space-y-3">
              {/* Active Item Container */}
              <div className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-950 flex items-center justify-center min-h-[260px] max-h-[360px]">
                {currentItem?.type === 'image' ? (
                  imageError[currentItem.id] ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-2">
                      <AlertCircle className="w-8 h-8 text-amber-500" />
                      <p className="text-xs font-medium">
                        {isBn ? 'ছবি লোড করা যায়নি' : 'Image preview unavailable'}
                      </p>
                      <span className="text-[11px] text-slate-500">{currentItem.url}</span>
                    </div>
                  ) : (
                    <div className="relative w-full h-full flex items-center justify-center group">
                      <img
                        src={currentItem.url}
                        alt={currentItem.caption || 'Complaint attachment'}
                        onError={() => handleImageError(currentItem.id)}
                        className="max-h-[340px] w-full object-contain cursor-pointer transition-transform duration-200"
                        onClick={() => setIsLightboxOpen(true)}
                        referrerPolicy="no-referrer"
                      />
                      {/* Zoom Overlay Trigger */}
                      <button
                        type="button"
                        onClick={() => setIsLightboxOpen(true)}
                        className="absolute bottom-3 right-3 p-2 bg-slate-900/80 hover:bg-slate-900 text-white rounded-md backdrop-blur-xs text-xs flex items-center gap-1.5 shadow-md opacity-90 group-hover:opacity-100 transition-opacity"
                        aria-label="Enlarge image"
                      >
                        <Maximize2 className="w-3.5 h-3.5" />
                        <span>{isBn ? 'বড় করে দেখুন' : 'Full Screen'}</span>
                      </button>
                    </div>
                  )
                ) : currentItem?.type === 'video' ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-300 space-y-3">
                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                      <Video className="w-7 h-7 text-sky-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{isBn ? 'ভিডিও প্রমাণ ফাইল' : 'Video Footage Attachment'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{currentItem.caption || currentItem.url}</p>
                    </div>
                    <Button variant="secondary" size="sm" leftIcon={<ExternalLink className="w-3.5 h-3.5" />}>
                      <span>{isBn ? 'প্লেয়ারে চালান' : 'Open in Media Player'}</span>
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center text-slate-300 space-y-3">
                    <div className="w-14 h-14 rounded-full bg-slate-800 flex items-center justify-center">
                      <FileText className="w-7 h-7 text-indigo-400" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{isBn ? 'পিডিএফ / ডকুমেন্ট ফাইল' : 'Official Document PDF'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{currentItem?.caption || currentItem?.url}</p>
                    </div>
                    <Button variant="secondary" size="sm" leftIcon={<Download className="w-3.5 h-3.5" />}>
                      <span>{isBn ? 'ডকুমেন্ট দেখুন' : 'View Document'}</span>
                    </Button>
                  </div>
                )}

                {/* Left/Right controls if multiple items */}
                {media.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrev}
                      className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors"
                      aria-label="Previous item"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={handleNext}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-white transition-colors"
                      aria-label="Next item"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>

              {/* Caption */}
              {currentItem?.caption && (
                <p className="text-xs text-slate-500 dark:text-slate-400 text-center italic">
                  "{currentItem.caption}"
                </p>
              )}

              {/* Thumbnails Row */}
              {media.length > 1 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-1">
                  {media.map((item, idx) => {
                    const isActive = idx === activeMediaIndex;
                    return (
                      <button
                        key={item.id || idx}
                        type="button"
                        onClick={() => setActiveMediaIndex(idx)}
                        className={cn(
                          'relative w-16 h-16 rounded-md overflow-hidden border-2 shrink-0 transition-all bg-slate-900',
                          isActive
                            ? 'border-sky-500 ring-2 ring-sky-500/30'
                            : 'border-slate-200 dark:border-slate-800 opacity-70 hover:opacity-100'
                        )}
                      >
                        {item.type === 'image' ? (
                          <img
                            src={item.thumbnailUrl || item.url}
                            alt=""
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                          />
                        ) : item.type === 'video' ? (
                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                            <Video className="w-5 h-5" />
                          </div>
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-slate-400">
                            <FileText className="w-5 h-5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Full-View Modal Lightbox */}
      {hasMedia && currentItem && currentItem.type === 'image' && (
        <Modal
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          title={isBn ? 'প্রমাণ মিডিয়া পূর্ণ দৃশ্য' : 'Full Evidentiary Image Inspection'}
          description={currentItem.caption || (isBn ? 'নাগরিক সংযুক্ত ছবি' : 'Citizen Attached Photo')}
          size="xl"
          footer={
            <div className="flex items-center justify-between w-full">
              <span className="text-xs text-slate-500 font-mono">
                {activeMediaIndex + 1} / {media.length}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => window.open(currentItem.url, '_blank')}
                  leftIcon={<ExternalLink className="w-3.5 h-3.5" />}
                >
                  <span>{isBn ? 'নতুন ট্যাবে খুলুন' : 'Open in New Tab'}</span>
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsLightboxOpen(false)}
                >
                  <span>{isBn ? 'বন্ধ করুন' : 'Close'}</span>
                </Button>
              </div>
            </div>
          }
        >
          <div className="flex items-center justify-center bg-slate-950 rounded-lg p-2 max-h-[70vh] overflow-hidden">
            <img
              src={currentItem.url}
              alt={currentItem.caption || 'Full view'}
              className="max-h-[65vh] w-auto object-contain rounded"
              referrerPolicy="no-referrer"
            />
          </div>
        </Modal>
      )}
    </>
  );
};

export default ComplaintMediaViewer;
