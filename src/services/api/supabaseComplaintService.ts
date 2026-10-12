/**
 * Supabase Complaint Service
 * Direct queries to public.complaints, public.segments, public.subcategories, and public.complaint_updates.
 * Real Supabase read-only operations for Sobaike Admin.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  Complaint,
  ComplaintFilterState,
  ComplaintLifecycleStatus,
  ComplaintListResponse,
  ComplaintMedia,
  ComplaintStatusTabCount,
  ComplaintTimelineEvent,
  ComplaintUrgency,
  TimelineEventType,
  ReporterDeviceLocation,
  HarassmentAgeGroup,
  HarassmentAbuserRelationship,
  HarassmentReportingFor,
  WorkflowActionResult,
} from '@/types/Complaint';
import {
  parseComplaintPrivacyChoice,
  parseComplaintPublicationPreferences,
} from './complaintPrivacy';

export interface SupabaseReporterLocationRow {
  complaint_id: string;
  reporter_latitude: number | null;
  reporter_longitude: number | null;
  accuracy_meters: number | null;
  captured_at: string | null;
}

export interface SupabaseSegment {
  id: string;
  name_en: string;
  name_bn: string;
  active?: boolean;
  sort_order?: number;
}

export interface SupabaseSubcategory {
  id: string;
  segment_id: string;
  name_en: string;
  name_bn: string;
  active?: boolean;
  sort_order?: number;
}

export interface SupabaseComplaintEvidenceRow {
  id: string;
  complaint_id: string;
  storage_path: string | null;
  file_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  media_type: string | null;
  file_size_bytes: number | null;
  caption: string | null;
  created_at: string;
}

export interface SupabaseComplaintRow {
  id: string;
  segment_id: string | null;
  subcategory_id: string | null;
  title: string | null;
  title_en: string | null;
  description: string | null;
  description_en: string | null;
  incident_date: string | null;
  incident_time: string | null;
  utility_end_time?: string | null;
  frequency: string | null;
  status: string | null;
  priority: string | null;
  privacy_choice: string | null;
  reporter_name: string | null;
  reporter_contact: string | null;
  confirm_public_identity: boolean | null;
  relationship_context: string | null;
  intimate_what_happened: string | null;
  intimate_platform: string | null;
  division: string | null;
  district: string | null;
  upazila_or_thana: string | null;
  area: string | null;
  road: string | null;
  landmark: string | null;
  formatted_address: string | null;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  has_supporting_info: boolean | null;
  evidence_types: string[] | null;
  evidence_description: string | null;
  affected_person_age_group: string | null;
  alleged_abuser_relationship: string | null;
  reporting_for: string | null;
  publication_preferences: Record<string, unknown> | null;
  recent_bill_month?: string | null;
  recent_bill_amount?: number | null;
  previous_bill_month?: string | null;
  previous_bill_amount?: number | null;
  created_at: string;
  updated_at: string | null;
}

export interface SupabaseComplaintUpdateRow {
  id: string;
  complaint_id: string;
  update_type: string;
  note: string | null;
  is_public: boolean | null;
  created_at: string;
}

// In-memory cache for taxonomy to avoid repeated requests
let cachedSegments: SupabaseSegment[] | null = null;
let cachedSubcategories: SupabaseSubcategory[] | null = null;
let taxonomyFetchPromise: Promise<{
  segments: SupabaseSegment[];
  subcategories: SupabaseSubcategory[];
}> | null = null;

const VALID_STATUSES: ComplaintLifecycleStatus[] = [
  'submitted',
  'published',
  'unpublished',
  'rejected',
  'edited',
];

/**
 * Fetch and cache taxonomy segments & subcategories
 */
export async function getTaxonomy(): Promise<{
  segments: SupabaseSegment[];
  subcategories: SupabaseSubcategory[];
}> {
  if (cachedSegments && cachedSubcategories) {
    return { segments: cachedSegments, subcategories: cachedSubcategories };
  }

  if (taxonomyFetchPromise) {
    return taxonomyFetchPromise;
  }

  taxonomyFetchPromise = (async () => {
    try {
      const [segRes, subRes] = await Promise.all([
        supabase
          .from('segments')
          .select('id, name_en, name_bn, active, sort_order')
          .order('sort_order', { ascending: true }),
        supabase
          .from('subcategories')
          .select('id, segment_id, name_en, name_bn, active, sort_order')
          .order('sort_order', { ascending: true }),
      ]);

      if (segRes.error) {
        console.warn('Error loading segments:', segRes.error.message);
      }
      if (subRes.error) {
        console.warn('Error loading subcategories:', subRes.error.message);
      }

      cachedSegments = segRes.data || [];
      cachedSubcategories = subRes.data || [];

      return {
        segments: cachedSegments,
        subcategories: cachedSubcategories,
      };
    } finally {
      taxonomyFetchPromise = null;
    }
  })();

  return taxonomyFetchPromise;
}

/**
 * Get category options for filtering
 */
export async function getTaxonomySegments(): Promise<SupabaseSegment[]> {
  const { segments } = await getTaxonomy();
  return segments.filter((s) => s.active !== false);
}

/**
 * Get distinct district locations from complaints
 */
export async function getDistinctLocations(): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('complaints')
      .select('district')
      .not('district', 'is', null)
      .neq('district', '')
      .limit(500);

    if (error) {
      console.warn('Error loading distinct districts:', error.message);
      return [];
    }

    const uniqueDistricts = Array.from(
      new Set(
        (data || [])
          .map((d: { district: string | null }) => d.district?.trim())
          .filter((d): d is string => Boolean(d))
      )
    ).sort((a, b) => a.localeCompare(b));

    return uniqueDistricts;
  } catch (err) {
    console.warn('Failed to get distinct locations:', err);
    return [];
  }
}

/**
 * Map raw Supabase row to domain Complaint model
 */
/**
 * Helper to detect Bengali Unicode characters
 */
export function containsBengali(text?: string | null): boolean {
  if (!text) return false;
  return /[\u0980-\u09FF]/.test(text);
}

export function mapSupabaseRowToComplaint(
  row: SupabaseComplaintRow,
  segmentsMap: Map<string, SupabaseSegment>,
  subcategoriesMap: Map<string, SupabaseSubcategory>
): Complaint {
  const segment = row.segment_id ? segmentsMap.get(row.segment_id) : undefined;
  const subcategory = row.subcategory_id
    ? subcategoriesMap.get(row.subcategory_id)
    : undefined;

  // Title mapping - preserve single language submissions without duplicating fallback content
  const rawTitle = row.title?.trim() || '';
  const rawTitleEn = row.title_en?.trim() || '';

  let titleBn = '';
  let titleEn = '';

  if (rawTitleEn && rawTitle && rawTitleEn !== rawTitle) {
    titleEn = rawTitleEn;
    titleBn = rawTitle;
  } else if (rawTitleEn && !rawTitle) {
    titleEn = rawTitleEn;
    titleBn = '';
  } else if (rawTitle) {
    if (containsBengali(rawTitle)) {
      titleBn = rawTitle;
      titleEn = '';
    } else {
      titleEn = rawTitle;
      titleBn = '';
    }
  } else {
    // If no title provided, fallback to ID
    titleBn = row.id;
    titleEn = row.id;
  }

  // Description mapping - preserve single language submissions without duplicating fallback content
  const rawDesc = row.description?.trim() || '';
  const rawDescEn = row.description_en?.trim() || '';

  let descriptionBn = '';
  let descriptionEn = '';

  if (rawDescEn && rawDesc && rawDescEn !== rawDesc) {
    descriptionEn = rawDescEn;
    descriptionBn = rawDesc;
  } else if (rawDescEn && !rawDesc) {
    descriptionEn = rawDescEn;
    descriptionBn = '';
  } else if (rawDesc) {
    if (containsBengali(rawDesc)) {
      descriptionBn = rawDesc;
      descriptionEn = '';
    } else {
      descriptionEn = rawDesc;
      descriptionBn = '';
    }
  }

  // Taxonomy mapping
  const categoryId = row.segment_id || '';
  const categoryEn = segment?.name_en || row.segment_id || '';
  const categoryBn = segment?.name_bn || row.segment_id || '';

  const subcategoryId = row.subcategory_id || '';
  const subcategoryEn = subcategory?.name_en || row.subcategory_id || '';
  const subcategoryBn = subcategory?.name_bn || row.subcategory_id || '';

  // Urgency mapping
  let urgency: ComplaintUrgency = 'medium';
  if (row.priority) {
    const p = row.priority.toLowerCase();
    if (p === 'urgent' || p === 'high' || p === 'medium' || p === 'low') {
      urgency = p;
    }
  }

  // Lifecycle Status mapping
  const rawStatus = (row.status || 'submitted').toLowerCase();
  const status: ComplaintLifecycleStatus = VALID_STATUSES.includes(
    rawStatus as ComplaintLifecycleStatus
  )
    ? (rawStatus as ComplaintLifecycleStatus)
    : 'submitted';

  // Privacy & Citizen Details
  const privacyChoice = parseComplaintPrivacyChoice(row.privacy_choice);
  const isAnonymous = privacyChoice === 'anonymous';
  const publicationPreferences = parseComplaintPublicationPreferences(row.publication_preferences);
  const citizenName = row.reporter_name?.trim() || undefined;

  // Check if reporter_contact looks like a phone number
  let citizenPhone: string | undefined = undefined;
  if (row.reporter_contact) {
    const contact = row.reporter_contact.trim();
    if (!contact.includes('@') && /[0-9+]/.test(contact)) {
      citizenPhone = contact;
    }
  }

  // Location mapping
  const addressFromParts = [
    row.area,
    row.upazila_or_thana,
    row.district,
    row.division,
  ]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(', ');

  const primaryAddress = row.formatted_address?.trim() || addressFromParts || '';

  const hasValidLat =
    row.latitude !== null &&
    row.latitude !== undefined &&
    !isNaN(Number(row.latitude));
  const hasValidLng =
    row.longitude !== null &&
    row.longitude !== undefined &&
    !isNaN(Number(row.longitude));

  const coordinates: [number, number] | undefined =
    hasValidLat && hasValidLng
      ? [Number(row.latitude), Number(row.longitude)]
      : undefined;

  const location = {
    addressEn: primaryAddress,
    addressBn: primaryAddress,
    ward: row.upazila_or_thana?.trim() || row.area?.trim() || '',
    zone: row.district?.trim() || row.division?.trim() || '',
    coordinates,
  };

  const createdAt = row.created_at || new Date().toISOString();
  const updatedAt = row.updated_at || row.created_at || createdAt;

  return {
    id: row.id,
    titleEn,
    titleBn,
    descriptionEn,
    descriptionBn,
    categoryId,
    categoryEn,
    categoryBn,
    subcategoryId,
    subcategoryEn,
    subcategoryBn,
    location,
    media: [],
    status,
    urgency,
    citizenName,
    citizenPhone,
    isAnonymous,
    privacyChoice,
    confirmPublicIdentity:
      typeof row.confirm_public_identity === 'boolean'
        ? row.confirm_public_identity
        : undefined,
    publicationPreferences,
    hasSupportingInfo: Boolean(
      row.has_supporting_info ||
      (Array.isArray(row.evidence_types) && row.evidence_types.length > 0)
    ),
    evidenceTypes: Array.isArray(row.evidence_types) ? row.evidence_types : [],
    evidenceDescription: row.evidence_description || undefined,
    affectedPersonAgeGroup: (row.affected_person_age_group as HarassmentAgeGroup | null) ?? null,
    allegedAbuserRelationship: (row.alleged_abuser_relationship as HarassmentAbuserRelationship | null) ?? null,
    reportingFor: (row.reporting_for as HarassmentReportingFor | null) ?? null,
    recentBillMonth: row.recent_bill_month ?? null,
    recentBillAmount:
      row.recent_bill_amount !== null && row.recent_bill_amount !== undefined
        ? Number(row.recent_bill_amount)
        : null,
    previousBillMonth: row.previous_bill_month ?? null,
    previousBillAmount:
      row.previous_bill_amount !== null && row.previous_bill_amount !== undefined
        ? Number(row.previous_bill_amount)
        : null,
    incidentDate: row.incident_date ?? null,
    incidentTime: row.incident_time ?? null,
    utilityEndTime: row.utility_end_time ?? null,
    frequency: row.frequency ?? null,
    upvotesCount: 0,
    commentsCount: 0,
    createdAt,
    updatedAt,
  };
}

/**
 * Map raw updates rows to ComplaintTimelineEvent[]
 */
export function mapComplaintUpdatesToTimeline(
  complaint: Complaint,
  updates: SupabaseComplaintUpdateRow[]
): ComplaintTimelineEvent[] {
  if (!updates || updates.length === 0) {
    // Generate initial registered event
    return [
      {
        id: `${complaint.id}-init`,
        complaintId: complaint.id,
        type: 'submitted',
        actorName: 'System',
        actorRole: 'Platform',
        timestamp: complaint.createdAt,
        titleEn: 'Complaint Submitted',
        titleBn: 'অভিযোগ দাখিল করা হয়েছে',
        descriptionEn: 'Complaint registered in the platform',
        descriptionBn: 'প্ল্যাটফর্মে অভিযোগ নিবন্ধিত হয়েছে',
        toStatus: 'submitted',
      },
    ];
  }

  return updates.map((u) => {
    const rawType = (u.update_type || '').toLowerCase();
    let type: TimelineEventType = 'official_update';
    let titleEn = 'Official Update';
    let titleBn = 'অফিসিয়াল আপডেট';
    let toStatus: ComplaintLifecycleStatus | undefined = undefined;

    if (rawType === 'submitted') {
      type = 'submitted';
      titleEn = 'Complaint Submitted';
      titleBn = 'অভিযোগ দাখিল করা হয়েছে';
      toStatus = 'submitted';
    } else if (rawType === 'published') {
      type = 'status_change';
      titleEn = 'Complaint Approved & Published';
      titleBn = 'অভিযোগ অনুমোদিত ও প্রকাশিত';
      toStatus = 'published';
    } else if (rawType === 'unpublished') {
      type = 'status_change';
      titleEn = 'Complaint Unpublished';
      titleBn = 'অভিযোগের প্রকাশনা বন্ধ করা হয়েছে';
      toStatus = 'unpublished';
    } else if (rawType === 'rejected') {
      type = 'status_change';
      titleEn = 'Complaint Rejected';
      titleBn = 'অভিযোগ বাতিল করা হয়েছে';
      toStatus = 'rejected';
    } else if (rawType === 'edited') {
      type = 'status_change';
      titleEn = 'Complaint Edited';
      titleBn = 'অভিযোগ সম্পাদন করা হয়েছে';
      toStatus = 'edited';
    } else if (rawType === 'assigned') {
      type = 'assigned';
      titleEn = 'Complaint Assigned';
      titleBn = 'অভিযোগ নির্ধারিত করা হয়েছে';
    } else if (rawType === 'info_requested') {
      type = 'info_requested';
      titleEn = 'Additional Information Requested';
      titleBn = 'অতিরিক্ত তথ্য চাওয়া হয়েছে';
    } else if (rawType === 'resolved') {
      type = 'resolved';
      titleEn = 'Complaint Resolved';
      titleBn = 'অভিযোগ নিষ্পত্তি হয়েছে';
    }

    return {
      id: u.id,
      complaintId: u.complaint_id,
      type,
      actorName: 'System',
      actorRole: 'Platform',
      timestamp: u.created_at,
      titleEn,
      titleBn,
      descriptionEn: u.note || '',
      descriptionBn: u.note || '',
      toStatus,
    };
  });
}

/**
 * Supabase Complaint Service Implementation
 */
export const supabaseComplaintService = {
  /**
   * Fetch paginated and filtered complaints from public.complaints
   */
  async getComplaints(
    filters: Partial<ComplaintFilterState> = {},
    page = 1,
    pageSize = 6
  ): Promise<ComplaintListResponse> {
    const { segments, subcategories } = await getTaxonomy();
    const segmentsMap = new Map(segments.map((s) => [s.id, s]));
    const subcategoriesMap = new Map(subcategories.map((s) => [s.id, s]));

    let query = supabase
      .from('complaints')
      .select('*', { count: 'exact' })
      .in('status', VALID_STATUSES);

    // Filter by Status
    if (filters.status && filters.status !== 'all') {
      query = query.eq('status', filters.status);
    }

    // Filter by Category (segment_id)
    if (filters.category && filters.category !== 'all') {
      query = query.eq('segment_id', filters.category);
    }

    // Filter by Subcategory (subcategory_id)
    if (filters.subcategory && filters.subcategory !== 'all') {
      query = query.eq('subcategory_id', filters.subcategory);
    }

    // Filter by Harassment Classification (Harassment segment only)
    if (filters.category === 'harassment') {
      if (filters.affectedPersonAgeGroup && filters.affectedPersonAgeGroup !== 'all') {
        query = query.eq('affected_person_age_group', filters.affectedPersonAgeGroup);
      }
      if (filters.allegedAbuserRelationship && filters.allegedAbuserRelationship !== 'all') {
        query = query.eq('alleged_abuser_relationship', filters.allegedAbuserRelationship);
      }
      if (filters.reportingFor && filters.reportingFor !== 'all') {
        query = query.eq('reporting_for', filters.reportingFor);
      }
    }

    // Filter by Location (district)
    if (filters.location && filters.location !== 'all') {
      query = query.eq('district', filters.location);
    }

    // Filter by Date Range
    if (filters.dateRange === 'today') {
      const past24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', past24h);
    } else if (filters.dateRange === 'week') {
      const past7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', past7d);
    } else if (filters.dateRange === 'month') {
      const past30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte('created_at', past30d);
    }

    // Filter by Search Query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const rawTerm = filters.searchQuery.trim();
      const sanitized = rawTerm.replace(/[,%_()]/g, ' ').trim();
      if (sanitized) {
        query = query.or(
          `id.ilike.%${sanitized}%,title.ilike.%${sanitized}%,title_en.ilike.%${sanitized}%,description.ilike.%${sanitized}%,description_en.ilike.%${sanitized}%,district.ilike.%${sanitized}%,upazila_or_thana.ilike.%${sanitized}%,area.ilike.%${sanitized}%`
        );
      }
    }

    // Sort descending by creation date and apply pagination range
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    query = query.order('created_at', { ascending: false }).range(from, to);

    const { data, error, count } = await query;

    if (error) {
      console.error('Supabase query error getComplaints:', error);
      throw new Error(`Failed to load complaints: ${error.message}`);
    }

    const items = (data || []).map((row) =>
      mapSupabaseRowToComplaint(
        row as SupabaseComplaintRow,
        segmentsMap,
        subcategoriesMap
      )
    );

    // Fetch live status counts for tabs
    const statusCounts = await this.getComplaintStats();

    const totalItems = count ?? items.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

    return {
      items,
      pagination: {
        currentPage: page,
        pageSize,
        totalItems,
        totalPages,
      },
      statusCounts,
    };
  },

  /**
   * Fetch lifecycle status counts for the status tabs
   */
  async getComplaintStats(): Promise<ComplaintStatusTabCount[]> {
    try {
      const [allRes, submittedRes, publishedRes, unpublishedRes, rejectedRes, editedRes] =
        await Promise.all([
          supabase
            .from('complaints')
            .select('*', { count: 'exact', head: true })
            .in('status', VALID_STATUSES),
          supabase
            .from('complaints')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'submitted'),
          supabase
            .from('complaints')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'published'),
          supabase
            .from('complaints')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'unpublished'),
          supabase
            .from('complaints')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'rejected'),
          supabase
            .from('complaints')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'edited'),
        ]);

      if (allRes.error) throw allRes.error;

      return [
        {
          status: 'all',
          labelEn: 'All Complaints',
          labelBn: 'সকল অভিযোগ',
          count: allRes.count ?? 0,
          badgeStatus: 'default',
        },
        {
          status: 'submitted',
          labelEn: 'Submitted',
          labelBn: 'দাখিলকৃত',
          count: submittedRes.count ?? 0,
          badgeStatus: 'pending',
        },
        {
          status: 'published',
          labelEn: 'Published',
          labelBn: 'প্রকাশিত',
          count: publishedRes.count ?? 0,
          badgeStatus: 'published',
        },
        {
          status: 'unpublished',
          labelEn: 'Unpublished',
          labelBn: 'অপ্রকাশিত',
          count: unpublishedRes.count ?? 0,
          badgeStatus: 'default',
        },
        {
          status: 'rejected',
          labelEn: 'Rejected',
          labelBn: 'বাতিলকৃত',
          count: rejectedRes.count ?? 0,
          badgeStatus: 'rejected',
        },
        {
          status: 'edited',
          labelEn: 'Edited',
          labelBn: 'সম্পাদিত',
          count: editedRes.count ?? 0,
          badgeStatus: 'info',
        },
      ];
    } catch (err) {
      console.error('Failed to get complaint stats from Supabase:', err);
      throw err;
    }
  },

  /**
   * Fetch single complaint by ID
   */
  async getComplaintById(id: string): Promise<Complaint | null> {
    const { segments, subcategories } = await getTaxonomy();
    const segmentsMap = new Map(segments.map((s) => [s.id, s]));
    const subcategoriesMap = new Map(subcategories.map((s) => [s.id, s]));

    const { data, error } = await supabase
      .from('complaints')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`Error loading complaint ${id}:`, error);
      throw new Error(`Failed to load complaint ${id}: ${error.message}`);
    }

    if (!data) return null;

    return mapSupabaseRowToComplaint(
      data as SupabaseComplaintRow,
      segmentsMap,
      subcategoriesMap
    );
  },

  /**
   * Fetch complaint updates / timeline events
   */
  async getComplaintTimeline(id: string): Promise<ComplaintTimelineEvent[]> {
    const complaint = await this.getComplaintById(id);
    if (!complaint) return [];

    const { data, error } = await supabase
      .from('complaint_updates')
      .select('*')
      .eq('complaint_id', id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error(`Error loading timeline for complaint ${id}:`, error);
      throw new Error('Failed to load complaint timeline.');
    }

    return mapComplaintUpdatesToTimeline(
      complaint,
      (data || []) as SupabaseComplaintUpdateRow[]
    );
  },

  /**
   * Fetch complaint evidence from public.complaint_evidence and create temporary authenticated signed URLs
   * from the private 'complaint-evidence' storage bucket.
   */
  async getComplaintEvidence(
    complaintId: string
  ): Promise<{ media: ComplaintMedia[]; error?: string | null }> {
    try {
      // 1. Call secure RPC admin_get_complaint_evidence
      const { data: rpcRows, error: rpcError } = await supabase.rpc('admin_get_complaint_evidence', {
        p_complaint_id: complaintId,
      });

      if (rpcError) {
        console.error(`Error calling admin_get_complaint_evidence for ${complaintId}:`, rpcError);
        if (rpcError.code === '42501' || rpcError.message?.includes('42501')) {
          return {
            media: [],
            error: 'You do not have permission to view private complaint evidence.',
          };
        }
        return {
          media: [],
          error: rpcError.message || 'Evidence images could not be loaded. Please retry.',
        };
      }

      const evidenceRows = (Array.isArray(rpcRows) ? rpcRows : []) as SupabaseComplaintEvidenceRow[];

      if (evidenceRows.length === 0) {
        return { media: [] };
      }

      // Collect storage paths to batch sign from private 'complaint-evidence' storage bucket
      const rowsWithStoragePath = evidenceRows.filter((r) => Boolean(r.storage_path));
      const pathsToSign = rowsWithStoragePath.map((r) => r.storage_path as string);

      const signedUrlMap = new Map<string, string>();

      if (pathsToSign.length > 0) {
        try {
          const { data: signedData, error: signError } = await supabase.storage
            .from('complaint-evidence')
            .createSignedUrls(pathsToSign, 3600);

          if (signError) {
            console.error(`Error generating batch signed URLs for complaint ${complaintId}:`, signError);
            // Fallback to individual signing if batch fails
            for (const path of pathsToSign) {
              try {
                const { data: singleSigned, error: singleError } = await supabase.storage
                  .from('complaint-evidence')
                  .createSignedUrl(path, 3600);
                if (!singleError && singleSigned?.signedUrl) {
                  signedUrlMap.set(path, singleSigned.signedUrl);
                }
              } catch (err) {
                console.warn(`Failed to sign individual path ${path}:`, err);
              }
            }
          } else if (signedData && Array.isArray(signedData)) {
            signedData.forEach((item) => {
              if (item.signedUrl && item.path) {
                signedUrlMap.set(item.path, item.signedUrl);
              }
            });
          }
        } catch (signErr) {
          console.error(`Storage signing exception for complaint ${complaintId}:`, signErr);
        }
      }

      // Map real evidence rows to existing ComplaintMedia objects
      const mediaList: ComplaintMedia[] = [];
      let signingFailures = 0;

      for (const row of evidenceRows) {
        let finalUrl = '';
        if (row.storage_path && signedUrlMap.has(row.storage_path)) {
          finalUrl = signedUrlMap.get(row.storage_path)!;
        } else if (
          row.file_url &&
          (row.file_url.startsWith('http://') ||
            row.file_url.startsWith('https://') ||
            row.file_url.startsWith('blob:'))
        ) {
          finalUrl = row.file_url;
        }

        if (!finalUrl && row.storage_path) {
          signingFailures++;
        }

        if (finalUrl) {
          let mediaType: 'image' | 'video' | 'document' = 'image';
          if (row.media_type === 'video' || row.mime_type?.startsWith('video/')) {
            mediaType = 'video';
          } else if (
            row.media_type === 'document' ||
            row.mime_type?.includes('pdf') ||
            row.mime_type?.includes('document')
          ) {
            mediaType = 'document';
          }

          mediaList.push({
            id: row.id,
            type: mediaType,
            url: finalUrl,
            thumbnailUrl: finalUrl,
            caption: row.caption || undefined,
          });
        }
      }

      if (evidenceRows.length > 0 && mediaList.length === 0 && signingFailures > 0) {
        return {
          media: [],
          error: 'Evidence images could not be loaded. Please retry.',
        };
      }

      return { media: mediaList };
    } catch (err) {
      console.error(`Failed to load complaint evidence for ${complaintId}:`, err);
      return {
        media: [],
        error: 'Evidence images could not be loaded. Please retry.',
      };
    }
  },

  /**
   * Fetch private reporter device location from secure RPC admin_get_complaint_reporter_location
   * Strictly isolated from incident location. Returns null if not captured, or flags permission denied / errors.
   */
  async getComplaintReporterLocation(
    complaintId: string
  ): Promise<{
    data: ReporterDeviceLocation | null;
    error?: string | null;
    isPermissionDenied?: boolean;
  }> {
    try {
      const { data: rpcRows, error: rpcError } = await supabase.rpc(
        'admin_get_complaint_reporter_location',
        { p_complaint_id: complaintId }
      );

      if (rpcError) {
        console.warn(`Error calling admin_get_complaint_reporter_location for ${complaintId}:`, rpcError);
        const isDenied =
          rpcError.code === '42501' ||
          rpcError.message?.toLowerCase().includes('denied') ||
          rpcError.message?.toLowerCase().includes('restricted') ||
          rpcError.message?.toLowerCase().includes('permission');

        if (isDenied) {
          return {
            data: null,
            error: 'Access restricted. You do not have permission to view private reporter device location.',
            isPermissionDenied: true,
          };
        }
        return {
          data: null,
          error: rpcError.message || 'Failed to load reporter device location.',
          isPermissionDenied: false,
        };
      }

      const rows = (Array.isArray(rpcRows) ? rpcRows : rpcRows ? [rpcRows] : []) as SupabaseReporterLocationRow[];
      if (rows.length === 0 || !rows[0]) {
        return { data: null };
      }

      const row = rows[0];
      if (
        typeof row.reporter_latitude !== 'number' ||
        typeof row.reporter_longitude !== 'number' ||
        isNaN(row.reporter_latitude) ||
        isNaN(row.reporter_longitude) ||
        (row.reporter_latitude === 0 && row.reporter_longitude === 0)
      ) {
        return { data: null };
      }

      return {
        data: {
          complaintId: row.complaint_id,
          latitude: row.reporter_latitude,
          longitude: row.reporter_longitude,
          accuracyMeters: typeof row.accuracy_meters === 'number' ? row.accuracy_meters : null,
          capturedAt: row.captured_at || null,
        },
      };
    } catch (err: any) {
      console.error(`Failed to load reporter device location for ${complaintId}:`, err);
      return {
        data: null,
        error: err?.message || 'Failed to load reporter device location.',
        isPermissionDenied: false,
      };
    }
  },

  /**
   * Fetch complaint detail and timeline bundle
   */
  async getComplaintDetail(
    id: string,
    options?: { loadEvidence?: boolean; loadReporterLocation?: boolean }
  ): Promise<{
    complaint: Complaint;
    timeline: ComplaintTimelineEvent[];
    timelineError?: string | null;
    evidenceError?: string | null;
    reporterLocation?: ReporterDeviceLocation | null;
    reporterLocationError?: string | null;
    reporterLocationPermissionDenied?: boolean;
  } | null> {
    const { segments, subcategories } = await getTaxonomy();
    const segmentsMap = new Map(segments.map((s) => [s.id, s]));
    const subcategoriesMap = new Map(subcategories.map((s) => [s.id, s]));

    const shouldLoadEvidence = options?.loadEvidence ?? true;
    const shouldLoadReporterLocation = options?.loadReporterLocation ?? true;

    const timelinePromise = this.getComplaintTimeline(id)
      .then((data) => ({
        data,
        error: null as string | null,
      }))
      .catch((err: unknown) => ({
        data: [] as ComplaintTimelineEvent[],
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load complaint timeline.',
      }));

    const [complaintRowRes, timelineResult, evidenceResult, reporterLocResult] = await Promise.all([
      supabase.from('complaints').select('*').eq('id', id).maybeSingle(),
      timelinePromise,
      shouldLoadEvidence ? this.getComplaintEvidence(id) : Promise.resolve({ media: [] }),
      shouldLoadReporterLocation ? this.getComplaintReporterLocation(id) : Promise.resolve({ data: null }),
    ]);

    if (complaintRowRes.error) {
      console.error(`Error loading complaint ${id}:`, complaintRowRes.error);
      throw new Error(`Failed to load complaint ${id}: ${complaintRowRes.error.message}`);
    }

    if (!complaintRowRes.data) return null;

    const complaint = mapSupabaseRowToComplaint(
      complaintRowRes.data as SupabaseComplaintRow,
      segmentsMap,
      subcategoriesMap
    );

    // Replace initial empty media array with real evidence media
    complaint.media = evidenceResult.media || [];

    // Attach private reporter device location separately if loaded
    if (reporterLocResult.data) {
      complaint.reporterDeviceLocation = reporterLocResult.data;
    }

    return {
      complaint,
      timeline: timelineResult.data,
      timelineError: timelineResult.error,
      evidenceError: evidenceResult.error || null,
      reporterLocation: reporterLocResult.data || null,
      reporterLocationError: reporterLocResult.error || null,
      reporterLocationPermissionDenied: Boolean(reporterLocResult.isPermissionDenied),
    };
  },

  /**
   * Publish complaint via RPC public.admin_publish_complaint(p_complaint_id)
   */
  async publishComplaint(complaintId: string): Promise<WorkflowActionResult> {
    const { data, error } = await supabase.rpc('admin_publish_complaint', {
      p_complaint_id: complaintId,
    });

    if (error) {
      console.error(`Error publishing complaint ${complaintId}:`, error);
      throw new Error(error.message || 'Failed to publish complaint');
    }

    if (data && typeof data === 'object' && 'success' in data && (data as { success: boolean }).success === false) {
      const errMsg =
        (data as { message?: string; error?: string }).message ||
        (data as { message?: string; error?: string }).error ||
        'Failed to publish complaint';
      throw new Error(errMsg);
    }

    // Re-fetch the refreshed complaint & timeline directly from Supabase (without re-requesting private evidence)
    const refreshed = await this.getComplaintDetail(complaintId, { loadEvidence: false });
    if (!refreshed) {
      throw new Error(`Failed to reload complaint ${complaintId} after publication.`);
    }

    return {
      success: true,
      complaint: refreshed.complaint,
      timeline: refreshed.timeline,
      timelineError: refreshed.timelineError || null,
      messageEn: 'Complaint published successfully to public feed.',
      messageBn: 'অভিযোগটি সফলভাবে পাবলিক ফিডে প্রকাশ করা হয়েছে।',
    };
  },

  /**
   * Unpublish complaint via RPC public.admin_unpublish_complaint(p_complaint_id, p_reason)
   */
  async unpublishComplaint(complaintId: string): Promise<WorkflowActionResult> {
    const { data, error } = await supabase.rpc('admin_unpublish_complaint', {
      p_complaint_id: complaintId,
      p_reason: null,
    });

    if (error) {
      console.error(`Error unpublishing complaint ${complaintId}:`, error);
      throw new Error(error.message || 'Failed to unpublish complaint');
    }

    if (data && typeof data === 'object' && 'success' in data && (data as { success: boolean }).success === false) {
      const errMsg =
        (data as { message?: string; error?: string }).message ||
        (data as { message?: string; error?: string }).error ||
        'Failed to unpublish complaint';
      throw new Error(errMsg);
    }

    // Re-fetch the refreshed complaint & timeline directly from Supabase (without re-requesting private evidence)
    const refreshed = await this.getComplaintDetail(complaintId, { loadEvidence: false });
    if (!refreshed) {
      throw new Error(`Failed to reload complaint ${complaintId} after unpublishing.`);
    }

    return {
      success: true,
      complaint: refreshed.complaint,
      timeline: refreshed.timeline,
      timelineError: refreshed.timelineError || null,
      messageEn: 'Complaint unpublished successfully.',
      messageBn: 'অভিযোগের প্রকাশনা সফলভাবে বন্ধ করা হয়েছে।',
    };
  },

  /**
   * Reject complaint via RPC public.admin_reject_complaint(p_complaint_id, p_reason_code, p_note)
   */
  async rejectComplaint(
    complaintId: string,
    reason: string,
    explanation: string
  ): Promise<WorkflowActionResult> {
    const { data, error } = await supabase.rpc('admin_reject_complaint', {
      p_complaint_id: complaintId,
      p_reason_code: reason,
      p_note: explanation,
    });

    if (error) {
      console.error(`Error rejecting complaint ${complaintId}:`, error);
      throw new Error(error.message || 'Failed to reject complaint');
    }

    if (data && typeof data === 'object' && 'success' in data && (data as { success: boolean }).success === false) {
      const errMsg =
        (data as { message?: string; error?: string }).message ||
        (data as { message?: string; error?: string }).error ||
        'Failed to reject complaint';
      throw new Error(errMsg);
    }

    // Re-fetch the refreshed complaint & timeline directly from Supabase (without re-requesting private evidence)
    const refreshed = await this.getComplaintDetail(complaintId, { loadEvidence: false });
    if (!refreshed) {
      throw new Error(`Failed to reload complaint ${complaintId} after rejection.`);
    }

    return {
      success: true,
      complaint: refreshed.complaint,
      timeline: refreshed.timeline,
      timelineError: refreshed.timelineError || null,
      messageEn: 'Complaint rejected successfully.',
      messageBn: 'অভিযোগটি সফলভাবে বাতিল করা হয়েছে।',
    };
  },

  /**
   * Edit complaint via RPC public.admin_edit_complaint(...)
   */
  async editComplaint(
    complaintId: string,
    updates: Partial<Complaint>,
    notes?: string
  ): Promise<WorkflowActionResult> {
    const { data, error } = await supabase.rpc('admin_edit_complaint', {
      p_complaint_id: complaintId,
      p_title_en: updates.titleEn ?? null,
      p_title_bn: updates.titleBn ?? null,
      p_description_en: updates.descriptionEn ?? null,
      p_description_bn: updates.descriptionBn ?? null,
      p_segment_id: updates.categoryId ?? null,
      p_subcategory_id: updates.subcategoryId ?? null,
      p_priority: updates.urgency ?? null,
      p_ward: updates.location?.ward ?? null,
      p_zone: updates.location?.zone ?? null,
      p_address_en: updates.location?.addressEn ?? null,
      p_address_bn: updates.location?.addressBn ?? null,
      p_notes: notes ?? null,
    });

    if (error) {
      console.error(`Error editing complaint ${complaintId}:`, error);
      throw new Error(error.message || 'Failed to edit complaint');
    }

    if (data && typeof data === 'object' && 'success' in data && (data as { success: boolean }).success === false) {
      const errMsg =
        (data as { message?: string; error?: string }).message ||
        (data as { message?: string; error?: string }).error ||
        'Failed to edit complaint';
      throw new Error(errMsg);
    }

    // Re-fetch the refreshed complaint & timeline directly from Supabase (without re-requesting private evidence)
    const refreshed = await this.getComplaintDetail(complaintId, { loadEvidence: false });
    if (!refreshed) {
      throw new Error(`Failed to reload complaint ${complaintId} after edit.`);
    }

    return {
      success: true,
      complaint: refreshed.complaint,
      timeline: refreshed.timeline,
      timelineError: refreshed.timelineError || null,
      messageEn: 'Complaint updated successfully.',
      messageBn: 'অভিযোগের বিবরণ সফলভাবে আপডেট করা হয়েছে।',
    };
  },
};
