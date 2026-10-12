/**
 * Dashboard API Service Layer
 * Aggregates real operational metrics.
 * Uses controlled SECURITY DEFINER aggregate RPC when Supabase is configured,
 * ensuring users with only 'dashboard.view' cannot perform direct row-level table reads.
 */

import {
  DashboardStats,
  StatusSummaryItem,
  CategorySummaryItem,
  RecentComplaintItem,
  LifecycleStatusKey,
} from '@/types/Dashboard';
import { complaintApi } from './complaintApi';
import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import { formatDate } from '@/utils/formatters';

export class DashboardApi {
  private aggregatesPromise: Promise<{
    stats: DashboardStats;
    categorySummary: CategorySummaryItem[];
  }> | null = null;


  /**
   * Fetch aggregate data via controlled SECURITY DEFINER RPC.
   * Coalesces concurrent calls so getDashboardStats, getStatusSummary, and
   * getCategorySummary trigger exactly one network RPC.
   */
  private async fetchAggregates(): Promise<{
    stats: DashboardStats;
    categorySummary: CategorySummaryItem[];
  }> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase dashboard service is not configured in this environment.');
    }

    if (this.aggregatesPromise) {
      return this.aggregatesPromise;
    }

    this.aggregatesPromise = (async () => {
      try {
        {
          const { data, error } = await supabase.rpc('admin_get_dashboard_aggregates');
          if (error) {
            console.error('admin_get_dashboard_aggregates RPC failed:', error);
            throw new Error(`Failed to load dashboard aggregates: ${error.message}`);
          }
          if (!data) {
            throw new Error('No dashboard aggregate data received.');
          }

          const rawStats = data.stats || {};
          const stats: DashboardStats = {
            totalComplaints: Number(rawStats.totalComplaints || 0),
            submitted: Number(rawStats.submitted || 0),
            published: Number(rawStats.published || 0),
            unpublished: Number(rawStats.unpublished || 0),
            rejected: Number(rawStats.rejected || 0),
            edited: Number(rawStats.edited || 0),
          };

          const rawCategories = Array.isArray(data.categorySummary) ? data.categorySummary : [];
          const categorySummary: CategorySummaryItem[] = rawCategories.map((c: any) => ({
            id: String(c.id),
            nameEn: String(c.nameEn || c.id),
            nameBn: String(c.nameBn || c.id),
            count: Number(c.count || 0),
            percentage: Number(c.percentage || 0),
          }));

          return { stats, categorySummary };
        }
      } finally {
        // Clear cached promise on next microtask so future manual refreshes trigger a new RPC
        Promise.resolve().then(() => {
          this.aggregatesPromise = null;
        });
      }
    })();

    return this.aggregatesPromise;
  }


  /**
   * Fetch high-level operational statistics.
   * Authorized by 'dashboard.view'.
   */
  async getDashboardStats(): Promise<DashboardStats> {
    const { stats } = await this.fetchAggregates();
    return stats;
  }

  /**
   * Fetch complaint distribution across real lifecycle statuses.
   * Authorized by 'dashboard.view'.
   */
  async getStatusSummary(): Promise<StatusSummaryItem[]> {
    const { stats } = await this.fetchAggregates();
    const total = stats.totalComplaints;

    const countMap = new Map<string, number>([
      ['submitted', stats.submitted],
      ['published', stats.published],
      ['unpublished', stats.unpublished],
      ['rejected', stats.rejected],
      ['edited', stats.edited ?? 0],
    ]);

    const definitions: Array<{
      key: LifecycleStatusKey;
      labelEn: string;
      labelBn: string;
      badgeStatus: StatusSummaryItem['badgeStatus'];
      descriptionEn: string;
      descriptionBn: string;
    }> = [
      {
        key: 'submitted',
        labelEn: 'Submitted',
        labelBn: 'জমা পড়েছে',
        badgeStatus: 'pending',
        descriptionEn: 'Awaiting moderation review',
        descriptionBn: 'মডারেশন পর্যালোচনার অপেক্ষায়',
      },
      {
        key: 'published',
        labelEn: 'Published',
        labelBn: 'প্রকাশিত',
        badgeStatus: 'published',
        descriptionEn: 'Visible on public feed',
        descriptionBn: 'পাবলিক সাইটে দৃশ্যমান ও সক্রিয়',
      },
      {
        key: 'unpublished',
        labelEn: 'Unpublished',
        labelBn: 'অপ্রকাশিত',
        badgeStatus: 'default',
        descriptionEn: 'Removed from public view',
        descriptionBn: 'পাবলিক ভিউ থেকে সরানো',
      },
      {
        key: 'rejected',
        labelEn: 'Rejected',
        labelBn: 'প্রত্যাখ্যাত',
        badgeStatus: 'rejected',
        descriptionEn: 'Not approved for publication',
        descriptionBn: 'প্রকাশের জন্য অনুমোদিত নয়',
      },
    ];

    // Include edited if represented in dataset
    const editedCount = countMap.get('edited') ?? 0;
    if (editedCount > 0) {
      definitions.push({
        key: 'edited',
        labelEn: 'Edited',
        labelBn: 'সম্পাদিত',
        badgeStatus: 'info',
        descriptionEn: 'Revised versions with updates',
        descriptionBn: 'সংশোধিত সংস্করণ',
      });
    }

    return definitions.map((def) => {
      const count = countMap.get(def.key) ?? 0;
      const percentage = total > 0 ? (count / total) * 100 : 0;

      return {
        key: def.key,
        labelEn: def.labelEn,
        labelBn: def.labelBn,
        count,
        percentage,
        badgeStatus: def.badgeStatus,
        descriptionEn: def.descriptionEn,
        descriptionBn: def.descriptionBn,
      };
    });
  }

  /**
   * Fetch taxonomy segment breakdown with real complaint counts.
   * Authorized by 'dashboard.view'.
   */
  async getCategorySummary(): Promise<CategorySummaryItem[]> {
    const { categorySummary } = await this.fetchAggregates();
    return categorySummary;
  }

  /**
   * Fetch recent real complaints for the dashboard review table.
   * STRICTLY requires 'complaints.view'.
   */
  async getRecentComplaints(limit = 6): Promise<RecentComplaintItem[]> {

    const response = await complaintApi.getComplaints({}, 1, limit);

    return response.items.map((complaint) => {
      const locationEn =
        complaint.location?.addressEn ||
        complaint.location?.zone ||
        complaint.location?.ward ||
        'Unknown';
      const locationBn =
        complaint.location?.addressBn ||
        complaint.location?.zone ||
        complaint.location?.ward ||
        'অজানা';

      return {
        id: complaint.id,
        titleEn: complaint.titleEn || complaint.id,
        titleBn: complaint.titleBn || complaint.id,
        categoryEn: complaint.categoryEn || 'Uncategorized',
        categoryBn: complaint.categoryBn || 'শ্রেণিহীন',
        locationEn,
        locationBn,
        ward: complaint.location?.ward || '',
        date: formatDate(complaint.createdAt),
        status: complaint.status as LifecycleStatusKey,
        urgency: complaint.urgency || 'medium',
      };
    });
  }
}

export const dashboardApi = new DashboardApi();
export default dashboardApi;
