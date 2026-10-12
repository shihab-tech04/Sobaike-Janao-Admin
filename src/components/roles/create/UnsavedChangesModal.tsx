import React from 'react';
import { AlertTriangle, X, ArrowLeft } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';

export interface UnsavedChangesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmDiscard: () => void;
}

export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
  isOpen,
  onClose,
  onConfirmDiscard,
}) => {
  const { t } = useLanguage();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.roles.cancelConfirmTitle}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2.5 w-full">
          <Button
            id="cancel-modal-keep-editing-btn"
            variant="secondary"
            size="sm"
            onClick={onClose}
          >
            <span>{t.roles.keepEditing}</span>
          </Button>
          <Button
            id="cancel-modal-discard-btn"
            variant="danger"
            size="sm"
            onClick={onConfirmDiscard}
            leftIcon={<X className="w-4 h-4" />}
          >
            <span>{t.roles.discardAndLeave}</span>
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3 py-1">
        <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed pt-1">
          {t.roles.cancelConfirmMessage}
        </p>
      </div>
    </Modal>
  );
};

export default UnsavedChangesModal;
