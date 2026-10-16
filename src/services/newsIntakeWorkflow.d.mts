export interface NewsIntakeRecord {
  [key: string]: unknown;
}

export interface NewsSourcePreview {
  approved: true;
  publisherName: string;
  sourceTitle: string;
  canonicalUrl: string;
  sourcePublishedDate: string | null;
  descriptionPreview: string;
  hostname: string;
}

export interface NewsIntakePublicationResult {
  published: Array<{ itemId: string; reportId: string }>;
  blocked: Array<{
    itemId: string;
    reportId?: string;
    stage?: 'create' | 'review' | 'publish';
    outcomeUnknown?: boolean;
    reason: string;
  }>;
  writesStarted: boolean;
}

export interface NewsIntakePublicationActions {
  previewSourcedReport(payload: unknown): Promise<unknown>;
  createSourcedReport(payload: unknown): Promise<unknown>;
  completeItemReview(itemId: string, reportId: string): Promise<unknown>;
  publishComplaint(reportId: string): Promise<unknown>;
}

export function getManualNewsCandidates(run: unknown): NewsIntakeRecord[];
export function normalizeNewsSourcePreview(value: unknown): NewsSourcePreview | null;
export function isPublishableSourcedReportPreview(value: unknown): boolean;
export function publishSelectedNewsCandidates(
  items: NewsIntakeRecord[],
  actions: NewsIntakePublicationActions
): Promise<NewsIntakePublicationResult>;
