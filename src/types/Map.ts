/**
 * Map Monitoring & Location Intelligence Domain Types
 * Derived from real Supabase complaints, segments, and subcategories.
 */

import { ComplaintLifecycleStatus } from './Complaint';

export interface MapComplaintLocation {
  formattedAddress: string;
  division: string;
  district: string;
  upazilaOrThana: string;
  area: string;
  road: string;
  landmark: string;
}

export interface MapComplaint {
  id: string;
  titleEn: string;
  titleBn: string;
  segmentId: string;
  segmentEn: string;
  segmentBn: string;
  subcategoryId: string;
  subcategoryEn: string;
  subcategoryBn: string;
  status: ComplaintLifecycleStatus;
  affectedPersonAgeGroup?: string | null;
  allegedAbuserRelationship?: string | null;
  reportingFor?: string | null;
  latitude: number;
  longitude: number;
  location: MapComplaintLocation;
  createdAt: string; // ISO date string
}

export interface MapFilterState {
  searchQuery: string;
  segment: string;
  subcategory: string;
  status: ComplaintLifecycleStatus | 'all';
  district: string;
  affectedPersonAgeGroup: string;
  allegedAbuserRelationship: string;
  reportingFor: string;
  dateRange: string;
}

export interface MapSummary {
  mappedCount: number;
  submittedCount: number;
  publishedCount: number;
  districtsCount: number;
}

export interface MapSegmentOption {
  id: string;
  nameEn: string;
  nameBn: string;
}

export interface MapSubcategoryOption {
  id: string;
  segmentId: string;
  nameEn: string;
  nameBn: string;
}

export interface MapDataset {
  complaints: MapComplaint[];
  totalSourceCount: number;
  unmappedCount: number;
  unsupportedStatusCount: number;
  segments: MapSegmentOption[];
  subcategories: MapSubcategoryOption[];
  districts: string[];
}

