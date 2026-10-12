/**
 * Response Types and Interfaces
 * Authoritative backend contract for Sobaike Admin Response Read.
 */

export type ResponseType =
  | 'citizen_information'
  | 'subject_response';

export type ResponseStatus =
  | 'pending_review'
  | 'published'
  | 'rejected'
  | 'unpublished';

export type ResponseStatusFilter =
  | 'all'
  | ResponseStatus;

export type ResponseTypeFilter =
  | 'all'
  | ResponseType;

export interface ResponseComplaintSummary {
  id: string;
  title: string;
  segmentId?: string | null;
  segmentNameEn?: string | null;
  segmentNameBn?: string | null;
  district?: string | null;
  status?: string | null;
}

export interface ResponseItem {
  id: string;
  complaintId: string;
  responseType: ResponseType;
  status: ResponseStatus;
  content: string;

  incidentDate?: string | null;

  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;

  rejectionReason?: string | null;
  rejectionNote?: string | null;
  unpublishReason?: string | null;

  contactConsent: boolean;
  contactInfo?: string | null;
  contactEmailOrPhone?: string | null;

  responderType?:
    | 'mentioned_person'
    | 'organization_rep'
    | 'legal_rep'
    | null;

  responderName?: string | null;
  designation?: string | null;
  organizationName?: string | null;
  officialStatement?: string | null;
  supportingDocumentsNote?: string | null;

  requestCorrectionOrRemoval: boolean;
  correctionDetails?: string | null;

  complaint: ResponseComplaintSummary;
}

export interface ResponseFilterState {
  search: string;
  status: ResponseStatusFilter;
  responseType: ResponseTypeFilter;

  dateRange: {
    startDate?: string;
    endDate?: string;
  };
}

export interface ResponseListResponse {
  responses: ResponseItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;

  statusCounts: {
    all: number;
    pending_review: number;
    published: number;
    rejected: number;
    unpublished: number;
  };
}

export interface ResponseModerationResult {
  success: boolean;
  responseId: string;
  previousStatus: ResponseStatus;
  status: ResponseStatus;
  updatedAt: string;
  publishedAt?: string | null;
}
