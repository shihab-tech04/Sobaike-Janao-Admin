import type {
  HarassmentAbuserRelationship,
  HarassmentAgeGroup,
  HarassmentReportingFor,
} from '@/types/Complaint';

export interface HarassmentClassificationOption {
  value: string;
  labelEn: string;
  labelBn: string;
}

export const HARASSMENT_AGE_GROUP_OPTIONS: HarassmentClassificationOption[] = [
  { value: 'under_18', labelEn: 'Under 18', labelBn: '১৮ বছরের নিচে' },
  { value: '18_29', labelEn: '18–29', labelBn: '১৮–২৯' },
  { value: '30_59', labelEn: '30–59', labelBn: '৩০–৫৯' },
  { value: '60_plus', labelEn: '60+', labelBn: '৬০+' },
  { value: 'prefer_not_to_say', labelEn: 'Prefer not to say / Unknown', labelBn: 'বলতে অনিচ্ছুক / অজানা' },
];

export const HARASSMENT_ABUSER_RELATIONSHIP_OPTIONS: HarassmentClassificationOption[] = [
  { value: 'intimate_partner', labelEn: 'Current/former intimate partner or spouse', labelBn: 'বর্তমান/সাবেক ঘনিষ্ঠ সঙ্গী বা জীবনসঙ্গী' },
  { value: 'household_family', labelEn: 'Immediate family / household member', labelBn: 'নিকট পরিবার / একই পরিবারের সদস্য' },
  { value: 'other_relative', labelEn: 'Other relative', labelBn: 'অন্যান্য আত্মীয়' },
  { value: 'friend_acquaintance', labelEn: 'Friend / acquaintance', labelBn: 'বন্ধু / পরিচিত ব্যক্তি' },
  { value: 'coworker_classmate', labelEn: 'Co-worker / classmate', labelBn: 'সহকর্মী / সহপাঠী' },
  { value: 'authority_caregiver_service_provider', labelEn: 'Authority / caregiver / service provider', labelBn: 'কর্তৃপক্ষ / পরিচর্যাকারী / সেবা প্রদানকারী' },
  { value: 'stranger', labelEn: 'Stranger', labelBn: 'অপরিচিত ব্যক্তি' },
  { value: 'other_or_unknown', labelEn: 'Other known person / Unknown', labelBn: 'অন্যান্য পরিচিত ব্যক্তি / অজানা' },
];

export const HARASSMENT_REPORTING_FOR_OPTIONS: HarassmentClassificationOption[] = [
  { value: 'self', labelEn: 'Myself', labelBn: 'নিজের জন্য' },
  { value: 'someone_else', labelEn: 'Someone else', labelBn: 'অন্য কারও জন্য' },
];

function findLabel(options: HarassmentClassificationOption[], value: string | null | undefined, language: 'en' | 'bn'): string {
  if (!value) return language === 'bn' ? 'রেকর্ড করা হয়নি' : 'Not recorded';
  const option = options.find((item) => item.value === value);
  if (!option) return value;
  return language === 'bn' ? option.labelBn : option.labelEn;
}

export function getHarassmentAgeGroupLabel(value: HarassmentAgeGroup | string | null | undefined, language: 'en' | 'bn' = 'en'): string {
  return findLabel(HARASSMENT_AGE_GROUP_OPTIONS, value, language);
}

export function getHarassmentRelationshipLabel(value: HarassmentAbuserRelationship | string | null | undefined, language: 'en' | 'bn' = 'en'): string {
  return findLabel(HARASSMENT_ABUSER_RELATIONSHIP_OPTIONS, value, language);
}

export function getHarassmentReportingForLabel(value: HarassmentReportingFor | string | null | undefined, language: 'en' | 'bn' = 'en'): string {
  return findLabel(HARASSMENT_REPORTING_FOR_OPTIONS, value, language);
}
