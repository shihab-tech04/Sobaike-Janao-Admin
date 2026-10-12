/**
 * Dashboard Domain Types
 * API-ready data structures for the Sobaike Admin Command Center
 */

import { BadgeStatus } from '@/components/ui/Badge';

export interface DashboardStats {
  totalComplaints: number;
  submitted: number;
  published: number;
  unpublished: number;
  rejected: number;
  edited?: number;
}

export type LifecycleStatusKey =
  | 'submitted'
  | 'published'
  | 'unpublished'
  | 'rejected'
  | 'edited';

export interface StatusSummaryItem {
  key: LifecycleStatusKey;
  labelEn: string;
  labelBn: string;
  count: number;
  percentage: number;
  badgeStatus: BadgeStatus;
  descriptionEn: string;
  descriptionBn: string;
}

export interface CategorySummaryItem {
  id: string;
  nameEn: string;
  nameBn: string;
  count: number;
  percentage: number;
}

export interface RecentComplaintItem {
  id: string;
  titleEn: string;
  titleBn: string;
  categoryEn: string;
  categoryBn: string;
  locationEn: string;
  locationBn: string;
  ward?: string;
  date: string;
  status: LifecycleStatusKey;
  urgency: 'low' | 'medium' | 'high' | 'urgent';
}
