import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { useLanguage } from '@/context/LanguageContext';
import { RoleStepper } from '@/components/roles/create/RoleStepper';
import { StepRoleDetails } from '@/components/roles/create/StepRoleDetails';
import { StepPermissions } from '@/components/roles/create/StepPermissions';
import { StepReview } from '@/components/roles/create/StepReview';
import { UnsavedChangesModal } from '@/components/roles/create/UnsavedChangesModal';
import { roleApi } from '@/services/api';
import { PermissionCatalogueItem, RoleApiError } from '@/types/Role';
import { generateRoleSlug } from '@/utils/roleUtils';

export const CreateRolePage: React.FC = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();

  // Form State - Separate EN and BN Role Names
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [nameEn, setNameEn] = useState<string>('');
  const [nameBn, setNameBn] = useState<string>('');
  const [active, setActive] = useState<boolean>(true);
  const [description, setDescription] = useState<string>('');
  const [selectedPermissionIds, setSelectedPermissionIds] = useState<string[]>([]);

  // Permissions catalogue cache for Step 2 and Step 3 review
  const [catalogue, setCatalogue] = useState<PermissionCatalogueItem[]>([]);
  const [isLoadingCatalogue, setIsLoadingCatalogue] = useState<boolean>(true);
  const [catalogueError, setCatalogueError] = useState<{ message: string; isPermissionDenied: boolean } | string | null>(null);
  const [catalogueLoadSucceeded, setCatalogueLoadSucceeded] = useState<boolean>(false);

  // Guard refs for single-fetch lifecycle and race-condition safety
  const catalogueFetchedRef = useRef<boolean>(false);
  const requestIdRef = useRef<number>(0);
  const tRef = useRef(t);
  tRef.current = t;

  // Submission State
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitError, setSubmitError] = useState<{
    message: string;
    isDuplicate: boolean;
    isPermissionDenied: boolean;
    isCompatibility: boolean;
  } | null>(null);

  // Unsaved changes confirmation modal
  const [showDiscardModal, setShowDiscardModal] = useState<boolean>(false);

  // Check if user has entered anything
  const hasUnsavedChanges =
    nameEn.trim().length > 0 ||
    nameBn.trim().length > 0 ||
    description.trim().length > 0 ||
    selectedPermissionIds.length > 0 ||
    active === false;

  const fetchCatalogue = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoadingCatalogue(true);
    setCatalogueError(null);
    setCatalogueLoadSucceeded(false);
    try {
      const items = await roleApi.getPermissionCatalogue();
      if (requestId !== requestIdRef.current) return;
      setCatalogue(items);
      setCatalogueLoadSucceeded(true);
    } catch (err: unknown) {
      if (requestId !== requestIdRef.current) return;
      console.warn('Permission catalogue fetch failed:', err);
      const isPermissionDenied =
        err instanceof RoleApiError &&
        (err.isPermissionDenied || (err as { code?: string }).code === '42501');
      const message = err instanceof Error ? err.message : tRef.current.roles.loadPermissionsError;
      setCatalogueError({ message, isPermissionDenied: Boolean(isPermissionDenied) });
      setCatalogueLoadSucceeded(false);
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoadingCatalogue(false);
      }
    }
  }, []);

  // Pre-load catalogue in background on mount once
  useEffect(() => {
    if (!catalogueFetchedRef.current) {
      catalogueFetchedRef.current = true;
      fetchCatalogue();
    }
  }, [fetchCatalogue]);

  const handleCancelAttempt = () => {
    if (hasUnsavedChanges) {
      setShowDiscardModal(true);
    } else {
      navigate('/roles');
    }
  };

  const handleConfirmDiscard = () => {
    setShowDiscardModal(false);
    navigate('/roles');
  };

  const isStep1Valid = (): boolean => {
    const trimmedEn = nameEn.trim();
    if (trimmedEn.length === 0) return false;
    return generateRoleSlug(trimmedEn).length > 0;
  };

  const isCatalogueReady =
    catalogueLoadSucceeded &&
    !isLoadingCatalogue &&
    catalogueError === null;

  const handleStep1Next = () => {
    if (!isStep1Valid()) return;
    setCurrentStep(2);
  };

  const handleStep2Next = () => {
    if (!isCatalogueReady) return;
    setCurrentStep(3);
  };

  const handleStepClick = (step: number) => {
    if (step === 1) {
      setCurrentStep(1);
    } else if (step === 2) {
      if (isStep1Valid()) {
        setCurrentStep(2);
      }
    } else if (step === 3) {
      if (isStep1Valid() && isCatalogueReady) {
        setCurrentStep(3);
      }
    }
  };

  const isStepValid = (step: number): boolean => {
    if (step === 1) return true;
    if (step === 2) return isStep1Valid();
    if (step === 3) return isStep1Valid() && isCatalogueReady;
    return false;
  };

  const handleSubmit = async () => {
    if (!isStep1Valid() || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    const trimmedEn = nameEn.trim();
    const trimmedBn = nameBn.trim();

    try {
      await roleApi.createRole({
        name_en: trimmedEn,
        name_bn: trimmedBn.length > 0 ? trimmedBn : null,
        active,
        permission_ids: selectedPermissionIds,
        description: description.trim() ? description.trim() : null,
      });

      // Navigate back to /roles with success state
      navigate('/roles', {
        state: {
          roleCreatedSuccess: true,
          createdRoleName: trimmedEn,
        },
      });
    } catch (err: unknown) {
      console.error('Create role failed:', err);

      let msg = t.roles.generalCreateError;
      let isDuplicate = false;
      let isPermissionDenied = false;
      let isCompatibility = false;

      if (err instanceof RoleApiError) {
        msg = err.message;
        isDuplicate = err.isDuplicate;
        isPermissionDenied = err.isPermissionDenied;
        isCompatibility = err.isCompatibilityError;
      } else if (err instanceof Error) {
        msg = err.message;
        const code = (err as { code?: string }).code;
        if (code === '23505' || err.message.toLowerCase().includes('already exists') || err.message.toLowerCase().includes('duplicate')) {
          isDuplicate = true;
        } else if (code === '42501' || err.message.toLowerCase().includes('permission denied')) {
          isPermissionDenied = true;
        } else if (code === 'COMPATIBILITY_ERROR' || err.message.toLowerCase().includes('bilingual role update')) {
          isCompatibility = true;
        }
      } else if (typeof err === 'object' && err !== null && 'code' in err) {
        const code = String((err as { code: unknown }).code);
        if (code === '23505') {
          isDuplicate = true;
        } else if (code === '42501') {
          isPermissionDenied = true;
        } else if (code === 'COMPATIBILITY_ERROR') {
          isCompatibility = true;
        }
      }

      setSubmitError({
        message: msg,
        isDuplicate,
        isPermissionDenied,
        isCompatibility,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Page Header */}
      <PageHeader
        title={t.roles.createRoleTitle}
        description={t.roles.createRoleSubtitle}
        breadcrumbs={[
          { label: t.roles.title, href: '/roles' },
          { label: t.roles.createRoleTitle },
        ]}
        actions={
          <Button
            id="header-back-to-roles-btn"
            variant="secondary"
            size="sm"
            onClick={handleCancelAttempt}
            leftIcon={<ArrowLeft className="w-3.5 h-3.5" />}
          >
            <span>{t.common.back}</span>
          </Button>
        }
      />

      {/* Stepper Progress */}
      <RoleStepper
        currentStep={currentStep}
        onStepClick={handleStepClick}
        isStepValid={isStepValid}
      />

      {/* Step Content */}
      {currentStep === 1 && (
        <StepRoleDetails
          nameEn={nameEn}
          nameBn={nameBn}
          active={active}
          description={description}
          onNameEnChange={setNameEn}
          onNameBnChange={setNameBn}
          onActiveChange={setActive}
          onDescriptionChange={setDescription}
          onNext={handleStep1Next}
          onCancel={handleCancelAttempt}
        />
      )}

      {currentStep === 2 && (
        <StepPermissions
          selectedPermissionIds={selectedPermissionIds}
          onPermissionsChange={setSelectedPermissionIds}
          permissionCatalogue={catalogue}
          isLoadingCatalogue={isLoadingCatalogue}
          catalogueError={catalogueError}
          onRetryCatalogue={fetchCatalogue}
          onNext={handleStep2Next}
          onBack={() => setCurrentStep(1)}
          onCancel={handleCancelAttempt}
        />
      )}

      {currentStep === 3 && (
        <StepReview
          nameEn={nameEn}
          nameBn={nameBn}
          active={active}
          description={description}
          selectedPermissionIds={selectedPermissionIds}
          permissionCatalogue={catalogue}
          isSubmitting={isSubmitting}
          submitError={submitError}
          onEditDetails={() => setCurrentStep(1)}
          onEditPermissions={() => setCurrentStep(2)}
          onSubmit={handleSubmit}
          onBack={() => setCurrentStep(2)}
          onCancel={handleCancelAttempt}
        />
      )}

      {/* Unsaved Changes Confirmation Modal */}
      <UnsavedChangesModal
        isOpen={showDiscardModal}
        onClose={() => setShowDiscardModal(false)}
        onConfirmDiscard={handleConfirmDiscard}
      />
    </div>
  );
};

export default CreateRolePage;
