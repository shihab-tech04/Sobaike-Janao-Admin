export interface RecoveryRecord {
  [key: string]: unknown;
}

export interface NormalizedNewsRun extends RecoveryRecord {
  items: RecoveryRecord[];
}

export interface NormalizedNewsDashboard {
  sources: RecoveryRecord[];
  runs: NormalizedNewsRun[];
  automation: RecoveryRecord;
}

export interface NormalizedNewsTaxonomy {
  segments: RecoveryRecord[];
  subcategories: RecoveryRecord[];
}

export interface NormalizedBannerRow {
  category_key: string;
  draft_content: RecoveryRecord;
  published_content: RecoveryRecord;
  draft_updated_at: string | null;
  published_at: string | null;
  version: number;
}

export interface NormalizedSystemHealthPayload extends RecoveryRecord {
  live: RecoveryRecord;
}

export function normalizeNewsIntakeDashboard(value: unknown): NormalizedNewsDashboard;
export function normalizeNewsIntakeTaxonomy(value: unknown): NormalizedNewsTaxonomy;
export function normalizeBannerRows(value: unknown): NormalizedBannerRow[];
export function normalizeSystemHealthPayload(value: unknown): NormalizedSystemHealthPayload;
export function summarizeNewsRun(run: RecoveryRecord): {
  itemCount: number;
  reviewCount: number;
  errorCount: number;
  createdCount: number;
  mergedCount: number;
};
