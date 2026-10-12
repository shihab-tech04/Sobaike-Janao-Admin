/**
 * Real Taxonomy API Service Layer
 * Reads the full Admin taxonomy through an authorized RPC and updates existing
 * taxonomy items through the categories.manage contract.
 */

import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  TaxonomySegment,
  TaxonomySubcategory,
  TaxonomySegmentNode,
  TaxonomyStats,
  TaxonomyUpdateInput,
} from '@/types/Category';

export interface TaxonomyBundle {
  segments: TaxonomySegment[];
  subcategories: TaxonomySubcategory[];
  fullTree: TaxonomySegmentNode[];
  stats: TaxonomyStats;
}

interface RawSegmentRow {
  id: string;
  name_en: string;
  name_bn: string;
  active: boolean;
  sort_order: number;
}

interface RawSubcategoryRow extends RawSegmentRow {
  segment_id: string;
}

interface RawTaxonomyBundle {
  segments?: RawSegmentRow[];
  subcategories?: RawSubcategoryRow[];
}

export class CategoryApi {
  /**
   * Fetch all taxonomy data through the Admin-only RPC so inactive records are
   * visible to authorized administrators without weakening public RLS.
   */
  async getTaxonomy(): Promise<TaxonomyBundle> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase taxonomy service is not configured in this environment.');
    }

    const { data, error } = await supabase.rpc('admin_get_taxonomy');

    if (error) {
      console.error('Supabase admin taxonomy query failed:', error);
      throw new Error(`Failed to load taxonomy: ${error.message}`);
    }

    const raw = (data || {}) as RawTaxonomyBundle;
    const segmentRows = Array.isArray(raw.segments) ? raw.segments : [];
    const subcategoryRows = Array.isArray(raw.subcategories) ? raw.subcategories : [];

    const segments: TaxonomySegment[] = segmentRows.map((row) => ({
      id: row.id,
      nameEn: row.name_en || row.name_bn || row.id,
      nameBn: row.name_bn || row.name_en || row.id,
      status: row.active === false ? 'inactive' : 'active',
      order: row.sort_order ?? 0,
    }));

    const subcategories: TaxonomySubcategory[] = subcategoryRows.map((row) => ({
      id: row.id,
      segmentId: row.segment_id,
      nameEn: row.name_en || row.name_bn || row.id,
      nameBn: row.name_bn || row.name_en || row.id,
      status: row.active === false ? 'inactive' : 'active',
      order: row.sort_order ?? 0,
    }));

    const fullTree: TaxonomySegmentNode[] = segments.map((seg) => ({
      ...seg,
      subcategories: subcategories.filter((sub) => sub.segmentId === seg.id),
    }));

    const activeSegments = segments.filter((s) => s.status === 'active').length;
    const activeSubs = subcategories.filter((s) => s.status === 'active').length;

    const stats: TaxonomyStats = {
      segments: segments.length,
      subcategories: subcategories.length,
      activeItems: activeSegments + activeSubs,
    };

    return {
      segments,
      subcategories,
      fullTree,
      stats,
    };
  }

  /**
   * Update an existing segment or subcategory. IDs and hierarchy are immutable.
   */
  async updateTaxonomyItem(input: TaxonomyUpdateInput): Promise<void> {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase taxonomy service is not configured in this environment.');
    }

    const id = input.id.trim();
    const nameEn = input.nameEn.trim();
    const nameBn = input.nameBn.trim();

    if (!id || !nameEn || !nameBn) {
      throw new Error('Taxonomy ID and both bilingual names are required.');
    }

    if (!Number.isInteger(input.order)) {
      throw new Error('Sort order must be an integer.');
    }

    const { error } = await supabase.rpc('admin_update_taxonomy_item', {
      p_item_type: input.itemType,
      p_item_id: id,
      p_name_en: nameEn,
      p_name_bn: nameBn,
      p_active: input.status === 'active',
      p_sort_order: input.order,
    });

    if (error) {
      throw new Error(`Failed to update taxonomy: ${error.message}`);
    }
  }

  async getSegments(): Promise<TaxonomySegment[]> {
    const { segments } = await this.getTaxonomy();
    return segments;
  }

  async getSubcategories(segmentId?: string): Promise<TaxonomySubcategory[]> {
    const { subcategories } = await this.getTaxonomy();
    if (segmentId && segmentId !== 'all') {
      return subcategories.filter((s) => s.segmentId === segmentId);
    }
    return subcategories;
  }

  async getTaxonomyTree(): Promise<TaxonomySegmentNode[]> {
    const { fullTree } = await this.getTaxonomy();
    return fullTree;
  }

  async getTaxonomyStats(): Promise<TaxonomyStats> {
    const { stats } = await this.getTaxonomy();
    return stats;
  }
}

export const categoryApi = new CategoryApi();
export default categoryApi;
