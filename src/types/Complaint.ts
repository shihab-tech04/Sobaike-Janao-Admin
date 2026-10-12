/**
 * Complaint Domain Types
 * Precise data structures matching the Sobaike public civic platform
 */

import { BadgeStatus } from '@/components/ui/Badge';

export type ComplaintLifecycleStatus =
  | 'submitted'
  | 'published'
  | 'unpublished'
  | 'rejected'
  | 'edited';

export type ComplaintUrgency = 'low' | 'medium' | 'high' | 'urgent';

export type ComplaintPrivacyChoice = 'anonymous' | 'admin_only' | 'public_identity';

export interface ComplaintPublicationPreferences {
  showSubjectName?: boolean;
  showOrganization?: boolean;
  showGeneralLocation?: boolean;
  showDescription?: boolean;
}

export type HarassmentAgeGroup =
  | 'under_18'
  | '18_29'
  | '30_59'
  | '60_plus'
  | 'prefer_not_to_say';

export type HarassmentAbuserRelationship =
  | 'intimate_partner'
  | 'household_family'
  | 'other_relative'
  | 'friend_acquaintance'
  | 'coworker_classmate'
  | 'authority_caregiver_service_provider'
  | 'stranger'
  | 'other_or_unknown';

export type HarassmentReportingFor = 'self' | 'someone_else';

export interface ComplaintLocation {
  addressEn: string;
  addressBn: string;
  /** Legacy Admin aliases kept for existing list/edit components. */
  ward: string;
  zone: string;
  /** Canonical citizen-submitted incident-location fields. */
  division?: string;
  district?: string;
  upazilaOrThana?: string;
  area?: string;
  road?: string;
  landmark?: string;
  formattedAddress?: string;
  placeId?: string;
  coordinates?: [number, number]; // [latitude, longitude]
}

/**
 * Citizen reporter device location captured privately at submission time.
 * MUST NEVER be mixed with or substituted for ComplaintLocation (incident location).
 */
export interface ReporterDeviceLocation {
  complaintId: string;
  latitude: number;
  longitude: number;
  accuracyMeters?: number | null;
  capturedAt?: string | null;
}

export interface ComplaintMedia {
  id: string;
  type: 'image' | 'video' | 'document';
  url: string;
  thumbnailUrl?: string;
  caption?: string;
}

export interface ComplaintVersion {
  versionNumber: number;
  titleEn: string;
  titleBn: string;
  descriptionEn: string;
  descriptionBn: string;
  categoryId: string;
  categoryEn: string;
  categoryBn: string;
  subcategoryId?: string;
  subcategoryEn?: string;
  subcategoryBn?: string;
  location: ComplaintLocation;
  media: ComplaintMedia[];
  urgency: ComplaintUrgency;
  editedAt: string; // ISO date string
  editedBy: {
    name: string;
    role: string;
  };
  editNotes?: string;
}

export interface Complaint {
  id: string;
  titleEn: string;
  titleBn: string;
  descriptionEn: string;
  descriptionBn: string;
  categoryId: string;
  categoryEn: string;
  categoryBn: string;
  subcategoryId: string;
  subcategoryEn: string;
  subcategoryBn: string;
  location: ComplaintLocation;
  media: ComplaintMedia[];
  status: ComplaintLifecycleStatus;
  urgency: ComplaintUrgency;
  citizenName?: string;
  citizenPhone?: string;
  isAnonymous?: boolean;
  privacyChoice?: ComplaintPrivacyChoice;
  confirmPublicIdentity?: boolean;
  publicationPreferences?: ComplaintPublicationPreferences;
  assignedDepartment?: string;
  upvotesCount: number;
  commentsCount: number;
  hasSupportingInfo?: boolean;
  evidenceTypes?: string[];
  evidenceDescription?: string;
  versions?: ComplaintVersion[];
  reporterDeviceLocation?: ReporterDeviceLocation | null;
  // Harassment-only citizen classification dimensions. Read-only in Admin.
  affectedPersonAgeGroup?: HarassmentAgeGroup | null;
  allegedAbuserRelationship?: HarassmentAbuserRelationship | null;
  reportingFor?: HarassmentReportingFor | null;
  // Utility Service Complaints specific attributes
  recentBillMonth?: string | null;
  recentBillAmount?: number | null;
  previousBillMonth?: string | null;
  previousBillAmount?: number | null;
  incidentDate?: string | null;
  incidentTime?: string | null;
  utilityEndTime?: string | null;
  frequency?: string | null;
  createdAt: string; // ISO date string
  updatedAt: string; // ISO date string
}

export interface ComplaintStatusTabCount {
  status: ComplaintLifecycleStatus | 'all';
  labelEn: string;
  labelBn: string;
  count: number;
  badgeStatus: BadgeStatus;
}

export interface ComplaintFilterState {
  searchQuery: string;
  status: ComplaintLifecycleStatus | 'all';
  category: string;
  subcategory: string;
  location: string;
  affectedPersonAgeGroup: string;
  allegedAbuserRelationship: string;
  reportingFor: string;
  dateRange: string;
}

export interface ComplaintPagination {
  currentPage: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type TimelineEventType =
  | 'submitted'
  | 'status_change'
  | 'assigned'
  | 'info_requested'
  | 'official_update'
  | 'comment'
  | 'resolved';

export interface ComplaintTimelineEvent {
  id: string;
  complaintId: string;
  type: TimelineEventType;
  actorName: string;
  actorRole: string;
  actorAvatar?: string;
  timestamp: string; // ISO date string
  titleEn: string;
  titleBn: string;
  descriptionEn?: string;
  descriptionBn?: string;
  fromStatus?: ComplaintLifecycleStatus;
  toStatus?: ComplaintLifecycleStatus;
  metadata?: Record<string, unknown>;
}

export interface ComplaintListResponse {
  items: Complaint[];
  pagination: ComplaintPagination;
  statusCounts: ComplaintStatusTabCount[];
}


export interface WorkflowActionResult {
  success: boolean;
  complaint: Complaint;
  timeline: ComplaintTimelineEvent[];
  timelineError?: string | null;
  messageEn: string;
  messageBn: string;
}
