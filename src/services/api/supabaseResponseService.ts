/**
 * Supabase Response Service
 * Authoritative RPC caller for administrative Response read operations.
 * Exclusively calls security definer RPCs admin_get_responses and admin_get_response_detail.
 * Never performs direct SELECT queries against public.complaint_responses.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  ResponseItem,
  ResponseFilterState,
  ResponseListResponse,
  ResponseStatusFilter,
  ResponseType,
  ResponseStatus,
  ResponseModerationResult,
} from '@/types/Response';

export interface RawComplaintSummary {
  id: string;
  title: string;
  segment_id?: string | null;
  segment_name_en?: string | null;
  segment_name_bn?: string | null;
  district?: string | null;
  status?: string | null;
}

export interface RawResponseRow {
  id: string;
  complaint_id: string;
  response_type: ResponseType;
  status: ResponseStatus;
  content: string;
  incident_date?: string | null;
  created_at: string;
  updated_at: string;
  published_at?: string | null;
  rejection_reason?: string | null;
  rejection_note?: string | null;
  unpublish_reason?: string | null;
  contact_consent: boolean;
  contact_info?: string | null;
  contact_email_or_phone?: string | null;
  responder_type?: 'mentioned_person' | 'organization_rep' | 'legal_rep' | null;
  responder_name?: string | null;
  designation?: string | null;
  organization_name?: string | null;
  official_statement?: string | null;
  supporting_documents_note?: string | null;
  request_correction_or_removal: boolean;
  correction_details?: string | null;
  complaint?: RawComplaintSummary | null;
  complaint_title?: string | null;
  complaint_district?: string | null;
  complaint_status?: string | null;
}

export interface RawAdminGetResponsesResult {
  responses: RawResponseRow[];
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

export interface RawResponseModerationResult {
  success: boolean;
  response_id: string;
  previous_status: ResponseStatus;
  status: ResponseStatus;
  updated_at: string;
  published_at?: string | null;
}

/**
 * Maps raw RPC response moderation JSON into the authoritative ResponseModerationResult type.
 */
export function mapModerationResult(raw: RawResponseModerationResult): ResponseModerationResult {
  return {
    success: Boolean(raw.success),
    responseId: raw.response_id,
    previousStatus: raw.previous_status,
    status: raw.status,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at || null,
  };
}

/**
 * Maps raw backend response JSON into the authoritative ResponseItem type.
 */
export function mapResponseRow(raw: RawResponseRow): ResponseItem {
  return {
    id: raw.id,
    complaintId: raw.complaint_id,
    responseType: raw.response_type,
    status: raw.status,
    content: raw.content || '',
    incidentDate: raw.incident_date || null,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    publishedAt: raw.published_at || null,
    rejectionReason: raw.rejection_reason || null,
    rejectionNote: raw.rejection_note || null,
    unpublishReason: raw.unpublish_reason || null,
    contactConsent: Boolean(raw.contact_consent),
    contactInfo: raw.contact_info || null,
    contactEmailOrPhone: raw.contact_email_or_phone || null,
    responderType: raw.responder_type || null,
    responderName: raw.responder_name || null,
    designation: raw.designation || null,
    organizationName: raw.organization_name || null,
    officialStatement: raw.official_statement || null,
    supportingDocumentsNote: raw.supporting_documents_note || null,
    requestCorrectionOrRemoval: Boolean(raw.request_correction_or_removal),
    correctionDetails: raw.correction_details || null,
    complaint: {
      id: raw.complaint?.id || raw.complaint_id,
      title: raw.complaint?.title || raw.complaint_title || '',
      segmentId: raw.complaint?.segment_id || null,
      segmentNameEn: raw.complaint?.segment_name_en || null,
      segmentNameBn: raw.complaint?.segment_name_bn || null,
      district: raw.complaint?.district || raw.complaint_district || null,
      status: raw.complaint?.status || raw.complaint_status || null,
    },
  };
}

export class SupabaseResponseService {
  /**
   * Fetches paginated responses using admin_get_responses RPC
   */
  async getResponses(
    filters: Partial<ResponseFilterState> = {},
    page = 1,
    limit = 20
  ): Promise<ResponseListResponse> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    const trimmedSearch = filters.search?.trim();
    const pSearch = trimmedSearch && trimmedSearch.length > 0 ? trimmedSearch : null;

    const pStatus =
      filters.status && filters.status !== 'all' ? filters.status : null;

    const pResponseType =
      filters.responseType && filters.responseType !== 'all'
        ? filters.responseType
        : null;

    const pStartDate = filters.dateRange?.startDate || null;
    const pEndDate = filters.dateRange?.endDate || null;

    const { data, error } = await supabase.rpc('admin_get_responses', {
      p_search: pSearch,
      p_status: pStatus,
      p_response_type: pResponseType,
      p_start_date: pStartDate,
      p_end_date: pEndDate,
      p_page: page,
      p_limit: limit,
    });

    if (error) {
      throw new Error(`Failed to fetch responses: ${error.message}`);
    }

    const result = data as RawAdminGetResponsesResult;
    if (!result) {
      return {
        responses: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        statusCounts: {
          all: 0,
          pending_review: 0,
          published: 0,
          rejected: 0,
          unpublished: 0,
        },
      };
    }

    const mappedResponses = Array.isArray(result.responses)
      ? result.responses.map(mapResponseRow)
      : [];

    return {
      responses: mappedResponses,
      total: result.total || 0,
      page: result.page || page,
      limit: result.limit || limit,
      totalPages: result.totalPages || 1,
      statusCounts: result.statusCounts || {
        all: 0,
        pending_review: 0,
        published: 0,
        rejected: 0,
        unpublished: 0,
      },
    };
  }

  /**
   * Fetches a single response by ID using admin_get_response_detail RPC
   */
  async getResponseById(id: string): Promise<ResponseItem | null> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    const trimmedId = id.trim();
    if (!trimmedId) {
      throw new Error('Response ID cannot be empty.');
    }

    const { data, error } = await supabase.rpc('admin_get_response_detail', {
      p_response_id: trimmedId,
    });

    if (error) {
      // If PostgreSQL returned not found (P0002)
      if (error.code === 'P0002' || error.message?.includes('not found')) {
        return null;
      }
      throw new Error(`Failed to fetch response details: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    return mapResponseRow(data as RawResponseRow);
  }

  /**
   * Fetches current counts for each status tab
   */
  async getStatusCounts(): Promise<Record<ResponseStatusFilter, number>> {
    const res = await this.getResponses({}, 1, 1);
    return res.statusCounts;
  }

  /**
   * Publishes a response using admin_publish_response RPC
   */
  async publishResponse(responseId: string): Promise<ResponseModerationResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    const trimmedId = responseId?.trim();
    if (!trimmedId) {
      throw new Error('Response ID cannot be empty.');
    }

    const { data, error } = await supabase.rpc('admin_publish_response', {
      p_response_id: trimmedId,
    });

    if (error) {
      throw new Error(`Failed to publish response: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from admin_publish_response RPC.');
    }

    return mapModerationResult(data as RawResponseModerationResult);
  }

  /**
   * Rejects a response using admin_reject_response RPC
   */
  async rejectResponse(responseId: string, note?: string): Promise<ResponseModerationResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    const trimmedId = responseId?.trim();
    if (!trimmedId) {
      throw new Error('Response ID cannot be empty.');
    }

    const normalizedNote = note?.trim() ? note.trim() : null;

    const { data, error } = await supabase.rpc('admin_reject_response', {
      p_response_id: trimmedId,
      p_note: normalizedNote,
    });

    if (error) {
      throw new Error(`Failed to reject response: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from admin_reject_response RPC.');
    }

    return mapModerationResult(data as RawResponseModerationResult);
  }

  /**
   * Unpublishes a response using admin_unpublish_response RPC
   */
  async unpublishResponse(responseId: string, reason?: string): Promise<ResponseModerationResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    const trimmedId = responseId?.trim();
    if (!trimmedId) {
      throw new Error('Response ID cannot be empty.');
    }

    const normalizedReason = reason?.trim() ? reason.trim() : null;

    const { data, error } = await supabase.rpc('admin_unpublish_response', {
      p_response_id: trimmedId,
      p_reason: normalizedReason,
    });

    if (error) {
      throw new Error(`Failed to unpublish response: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from admin_unpublish_response RPC.');
    }

    return mapModerationResult(data as RawResponseModerationResult);
  }

  /**
   * Resubmits a rejected response back to pending_review using admin_resubmit_response RPC
   */
  async resubmitResponse(responseId: string): Promise<ResponseModerationResult> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase client is not configured.');
    }

    const trimmedId = responseId?.trim();
    if (!trimmedId) {
      throw new Error('Response ID cannot be empty.');
    }

    const { data, error } = await supabase.rpc('admin_resubmit_response', {
      p_response_id: trimmedId,
    });

    if (error) {
      throw new Error(`Failed to resubmit response: ${error.message}`);
    }

    if (!data) {
      throw new Error('No data returned from admin_resubmit_response RPC.');
    }

    return mapModerationResult(data as RawResponseModerationResult);
  }
}

export const supabaseResponseService = new SupabaseResponseService();
export default supabaseResponseService;
