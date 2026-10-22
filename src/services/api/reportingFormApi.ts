import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export const REPORTING_FIELD_TYPES = [
  'text', 'textarea', 'number', 'currency', 'date', 'time', 'month',
  'select', 'radio', 'checkbox', 'multiselect', 'phone', 'email', 'url',
  'location', 'subject_party', 'evidence', 'privacy', 'mob_justice_details',
] as const;

export type ReportingFieldType = typeof REPORTING_FIELD_TYPES[number];
export type ReportingFieldOption = { value: string; labelEn: string; labelBn: string; [key: string]: unknown };
export interface ReportingFormField {
  id?: string;
  fieldKey: string;
  fieldType: ReportingFieldType;
  storageMode: 'core_column' | 'custom_json' | 'system_block';
  storageKey: string;
  labelEn: string;
  labelBn: string;
  helperEn?: string | null;
  helperBn?: string | null;
  placeholderEn?: string | null;
  placeholderBn?: string | null;
  required: boolean;
  active: boolean;
  sortOrder: number;
  options: ReportingFieldOption[];
  validation: Record<string, unknown>;
  config: Record<string, unknown>;
}

export interface ReportingForm {
  schema: null | {
    id: string;
    scopeType: string;
    scopeId: string;
    version: number;
    status: 'draft' | 'published' | 'archived';
    engineMode: string;
    notes?: string | null;
    updatedAt?: string;
    publishedAt?: string | null;
  };
  fields: ReportingFormField[];
}

export const isProtectedField = (field: ReportingFormField): boolean =>
  field.storageMode === 'core_column' && ['title', 'description'].includes(field.storageKey);

/** Mirror server invariants for early feedback. SQL validation is authoritative. */
export function validateReportingFormFields(fields: ReportingFormField[]): string | null {
  if (!Array.isArray(fields) || fields.length > 60) return 'A form can contain at most 60 fields.';
  const seen = new Set<string>();
  let hasTitle = false;
  let hasDescription = false;
  for (const field of fields) {
    if (!/^[a-z][a-z0-9_]{0,63}$/.test(field.fieldKey)) return `Invalid field key: ${field.fieldKey}`;
    if (seen.has(field.fieldKey)) return `Duplicate field key: ${field.fieldKey}`;
    seen.add(field.fieldKey);
    if (!REPORTING_FIELD_TYPES.includes(field.fieldType)) return `Unsupported field type: ${field.fieldKey}`;
    if (!['core_column', 'custom_json', 'system_block'].includes(field.storageMode) || !field.storageKey.trim())
      return `Invalid storage mapping: ${field.fieldKey}`;
    if (!field.labelEn.trim() || !field.labelBn.trim()) return `Both language labels are required: ${field.fieldKey}`;
    if (!Number.isInteger(field.sortOrder) || field.sortOrder < 1 || field.sortOrder > 999)
      return `Sort order must be 1–999: ${field.fieldKey}`;
    if (!Array.isArray(field.options)) return `Invalid choices: ${field.fieldKey}`;
    if (['select', 'radio', 'multiselect'].includes(field.fieldType)) {
      if (!field.options.length) return `Add at least one bilingual choice: ${field.fieldKey}`;
      const optionValues = new Set<string>();
      for (const option of field.options) {
        if (!option.value?.trim() || !option.labelEn?.trim() || !option.labelBn?.trim() || optionValues.has(option.value))
          return `Choices need distinct values and both labels: ${field.fieldKey}`;
        optionValues.add(option.value);
      }
    }
    if (isProtectedField(field)) {
      if (!field.required || !field.active || !['text', 'textarea'].includes(field.fieldType))
        return `Required Title and Description must stay active and text-compatible.`;
      const limit = field.storageKey === 'title' ? 100 : 2000;
      if (Number(field.validation?.maxLength || 0) > limit) return `${field.fieldKey} exceeds maximum length ${limit}`;
      if (field.storageKey === 'title') hasTitle = true;
      if (field.storageKey === 'description') hasDescription = true;
    }
  }
  if (!hasTitle || !hasDescription) return 'Required Title and Description fields must be retained.';
  return null;
}

const requireBackend = () => {
  if (!isSupabaseConfigured) throw new Error('Reporting form service is unavailable in the static recovery preview.');
};

export const reportingFormApi = {
  async get(subcategoryId: string): Promise<ReportingForm> {
    requireBackend();
    const { data, error } = await supabase.rpc('admin_get_reporting_form', { p_subcategory_id: subcategoryId });
    if (error) throw new Error(error.message);
    if (!data || !Array.isArray(data.fields)) throw new Error('Unexpected reporting form response.');
    return data as ReportingForm;
  },

  async saveDraft(subcategoryId: string, fields: ReportingFormField[], notes: string): Promise<void> {
    requireBackend();
    const invalid = validateReportingFormFields(fields);
    if (invalid) throw new Error(invalid);
    const { data, error } = await supabase.rpc('admin_save_reporting_form_draft', {
      p_subcategory_id: subcategoryId, p_fields: fields, p_notes: notes.trim() || null,
    });
    if (error || data?.success !== true) throw new Error(error?.message || 'Server rejected the form draft.');
  },

  async publishForm(subcategoryId: string): Promise<void> {
    requireBackend();
    const { data, error } = await supabase.rpc('admin_publish_reporting_form', { p_subcategory_id: subcategoryId });
    if (error || data?.success !== true) throw new Error(error?.message || 'Server rejected form publication.');
  },
};
