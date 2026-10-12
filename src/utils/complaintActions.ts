import { ComplaintLifecycleStatus } from '@/types/Complaint';

export type ComplaintActionId =
  | 'edit'
  | 'publish'
  | 'unpublish'
  | 'reject';

export interface ComplaintActionConfig {
  id: ComplaintActionId;
  labelEn: string;
  labelBn: string;
  variant: 'primary' | 'secondary' | 'success' | 'danger';
  iconName: 'Edit' | 'Share2' | 'EyeOff' | 'XCircle';
}

export const COMPLAINT_ACTION_DEFINITIONS: Record<ComplaintActionId, ComplaintActionConfig> = {
  edit: {
    id: 'edit',
    labelEn: 'Edit Complaint',
    labelBn: 'অভিযোগ সম্পাদনা',
    variant: 'primary',
    iconName: 'Edit',
  },
  publish: {
    id: 'publish',
    labelEn: 'Publish to Feed',
    labelBn: 'পাবলিক ফিডে প্রকাশ',
    variant: 'success',
    iconName: 'Share2',
  },
  unpublish: {
    id: 'unpublish',
    labelEn: 'Unpublish',
    labelBn: 'প্রকাশনা বন্ধ করুন',
    variant: 'secondary',
    iconName: 'EyeOff',
  },
  reject: {
    id: 'reject',
    labelEn: 'Reject Complaint',
    labelBn: 'বাতিল করুন',
    variant: 'danger',
    iconName: 'XCircle',
  },
};

/**
 * Returns available actions strictly based on current complaint status.
 *
 * Status Matrix:
 * - submitted: [publish, reject]
 * - published: [unpublish]
 * - unpublished: [publish]
 * - rejected: []
 * - edited: []
 */
export function getAvailableComplaintActions(
  status: ComplaintLifecycleStatus
): ComplaintActionConfig[] {
  switch (status) {
    case 'submitted':
      return [
        COMPLAINT_ACTION_DEFINITIONS.publish,
        COMPLAINT_ACTION_DEFINITIONS.reject,
      ];

    case 'published':
      return [
        COMPLAINT_ACTION_DEFINITIONS.unpublish,
      ];

    case 'unpublished':
      return [
        COMPLAINT_ACTION_DEFINITIONS.publish,
      ];

    case 'edited':
      return [];

    case 'rejected':
      return [];

    default:
      return [];
  }
}

/**
 * Status Transition Guidance Text
 */
export function getComplaintStatusGuidance(
  status: ComplaintLifecycleStatus,
  language: 'en' | 'bn' = 'en'
): string {
  const isBn = language === 'bn';
  switch (status) {
    case 'submitted':
      return isBn
        ? 'নতুন দাখিলকৃত অভিযোগ। পর্যালোচনা করে প্রকাশ করুন অথবা বাতিল করুন।'
        : 'Newly submitted complaint. Review it, then publish or reject.';
    case 'published':
      return isBn
        ? 'অভিযোগটি বর্তমানে পাবলিক ফিডে প্রকাশিত আছে। জনসমক্ষে আর দেখানো না হলে প্রকাশনা বন্ধ করতে পারেন।'
        : 'This complaint is currently live on the public feed. You can unpublish it if it should no longer be publicly visible.';
    case 'unpublished':
      return isBn
        ? 'অভিযোগটি বর্তমানে পাবলিক ফিডে দৃশ্যমান নয়। প্রস্তুত হলে আবার প্রকাশ করতে পারেন।'
        : 'This complaint is not visible on the public feed. You can publish it again when ready.';
    case 'rejected':
      return isBn
        ? 'অভিযোগটি বাতিল করা হয়েছে।'
        : 'This complaint has been rejected.';
    case 'edited':
      return isBn
        ? 'অভিযোগটি সম্পাদিত অবস্থায় রয়েছে। বর্তমানে কোনো মডারেশন অ্যাকশন সক্রিয় নেই।'
        : 'This complaint is in Edited status. No moderation action is currently enabled.';
    default:
      return '';
  }
}
