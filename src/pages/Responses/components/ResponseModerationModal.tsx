import React from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useLanguage } from '@/context/LanguageContext';
import { AlertTriangle, CheckCircle2, RotateCcw, ShieldAlert } from 'lucide-react';

export type ResponseModerationAction = 'publish' | 'reject' | 'unpublish' | 'resubmit';

export interface ResponseModerationModalProps {
  isOpen: boolean;
  action: ResponseModerationAction | null;
  responseId: string;
  isSubmitting: boolean;
  error: string | null;
  note: string;
  onNoteChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}

export const ResponseModerationModal: React.FC<ResponseModerationModalProps> = ({
  isOpen,
  action,
  responseId,
  isSubmitting,
  error,
  note,
  onNoteChange,
  onClose,
  onConfirm,
}) => {
  const { language } = useLanguage();
  const isBn = language === 'bn';

  if (!action) return null;

  const getModalConfig = () => {
    switch (action) {
      case 'publish':
        return {
          title: isBn ? 'প্রতিক্রিয়া প্রকাশ করুন' : 'Publish Response',
          body: isBn
            ? 'আপনি কি এই প্রতিক্রিয়াটিকে প্রকাশিত হিসেবে চিহ্নিত করতে চান?'
            : 'Are you sure you want to mark this response as Published?',
          confirmText: isBn ? 'প্রতিক্রিয়া প্রকাশ করুন' : 'Publish Response',
          confirmVariant: 'primary' as const,
          showTextarea: false,
          textareaLabel: '',
          textareaPlaceholder: '',
          icon: <CheckCircle2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />,
        };
      case 'reject':
        return {
          title: isBn ? 'প্রতিক্রিয়া প্রত্যাখ্যান করুন' : 'Reject Response',
          body: isBn
            ? 'এই প্রতিক্রিয়াটি প্রত্যাখ্যান করবেন? এটি পর্যালোচনা অপেক্ষমাণ অবস্থা থেকে প্রত্যাখ্যাত অবস্থায় যাবে।'
            : 'Reject this response? It will move from Pending Review to Rejected.',
          confirmText: isBn ? 'প্রতিক্রিয়া প্রত্যাখ্যান করুন' : 'Reject Response',
          confirmVariant: 'danger' as const,
          showTextarea: true,
          textareaLabel: isBn ? 'প্রশাসনিক নোট (ঐচ্ছিক)' : 'Administrative note (optional)',
          textareaPlaceholder: isBn
            ? 'এই সিদ্ধান্ত সম্পর্কে একটি অভ্যন্তরীণ নোট যোগ করুন'
            : 'Add an internal note about this decision',
          icon: <ShieldAlert className="w-5 h-5 text-red-600 dark:text-red-400" />,
        };
      case 'unpublish':
        return {
          title: isBn ? 'প্রতিক্রিয়া অপ্রকাশিত করুন' : 'Unpublish Response',
          body: isBn
            ? 'এই প্রতিক্রিয়াটিকে প্রকাশিত অবস্থা থেকে অপ্রকাশিত অবস্থায় নিতে চান?'
            : 'Move this response from Published to Unpublished?',
          confirmText: isBn ? 'প্রতিক্রিয়া অপ্রকাশিত করুন' : 'Unpublish Response',
          confirmVariant: 'danger' as const,
          showTextarea: true,
          textareaLabel: isBn ? 'কারণ (ঐচ্ছিক)' : 'Reason (optional)',
          textareaPlaceholder: isBn
            ? 'অপ্রকাশিত করার একটি অভ্যন্তরীণ কারণ যোগ করুন'
            : 'Add an internal reason for unpublishing',
          icon: <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />,
        };
      case 'resubmit':
        return {
          title: isBn ? 'প্রতিক্রিয়া পুনরায় পর্যালোচনায় পাঠান' : 'Resubmit Response',
          body: isBn
            ? 'এই প্রত্যাখ্যাত প্রতিক্রিয়াটি আবার পর্যালোচনা অপেক্ষমাণ অবস্থায় পাঠাবেন? প্রতিক্রিয়ার বিষয়বস্তু পরিবর্তন হবে না।'
            : 'Send this rejected response back to Pending Review? The response content will not be changed.',
          confirmText: isBn ? 'পুনরায় পর্যালোচনায় পাঠান' : 'Resubmit Response',
          confirmVariant: 'primary' as const,
          showTextarea: false,
          textareaLabel: '',
          textareaPlaceholder: '',
          icon: <RotateCcw className="w-5 h-5 text-sky-600 dark:text-sky-400" />,
        };
    }
  };

  const config = getModalConfig();

  return (
    <Modal
      isOpen={isOpen}
      onClose={isSubmitting ? () => {} : onClose}
      title={config.title}
      size="md"
      closeOnBackdrop={!isSubmitting}
      footer={
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {isBn ? 'বাতিল' : 'Cancel'}
          </Button>
          <Button
            type="button"
            variant={config.confirmVariant}
            onClick={onConfirm}
            isLoading={isSubmitting}
            disabled={isSubmitting}
            className="w-full sm:w-auto min-h-[44px]"
          >
            {config.confirmText}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Context Summary */}
        <div className="flex items-start gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800">
          <div className="mt-0.5 shrink-0">{config.icon}</div>
          <div className="text-sm space-y-1">
            <p className="font-medium text-slate-900 dark:text-slate-100">
              {config.body}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              {isBn ? 'প্রতিক্রিয়া আইডি' : 'Response ID'}: #{responseId}
            </p>
          </div>
        </div>

        {/* Optional Note / Reason Textarea */}
        {config.showTextarea && (
          <div className="space-y-1.5">
            <Textarea
              id="response-moderation-note"
              label={config.textareaLabel}
              placeholder={config.textareaPlaceholder}
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              disabled={isSubmitting}
              rows={3}
              className="min-h-[80px]"
            />
          </div>
        )}

        {/* Real Backend Error Display */}
        {error && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-700 dark:text-red-300 text-xs animate-in fade-in">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <p className="font-semibold">
                {isBn ? 'মডারেশন ব্যর্থ হয়েছে' : 'Moderation failed'}
              </p>
              <p className="break-words">{error}</p>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
};

export default ResponseModerationModal;
