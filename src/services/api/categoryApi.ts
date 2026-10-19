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

export interface TaxonomyCreateInput {
  itemType: 'segment' | 'subcategory';
  id: string;
  parentSegmentId?: string;
  nameEn: string;
  nameBn: string;
  order: number;
}

export interface TaxonomyMoveInput {
  subcategoryId: string;
  targetSegmentId: string;
  order: number;
}

export interface TaxonomyConfiguration {
  id: string;
  descriptionEn: string;
  descriptionBn: string;
  shortNameEn?: string;
  shortNameBn?: string;
  slug?: string;
}

interface RawTaxonomyConfigurationItem {
  id: string;
  description_en?: string;
  description_bn?: string;
  short_name_en?: string;
  short_name_bn?: string;
  slug?: string;
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
  async getTaxonomyConfigurationItem(itemType: 'segment' | 'subcategory', itemId: string): Promise<TaxonomyConfiguration> {
    if (!isSupabaseConfigured) throw new Error('Taxonomy configuration service is unavailable.');
    const { data, error } = await supabase.rpc('admin_get_taxonomy_configuration');
    if (error) throw new Error(error.message);
    const list: RawTaxonomyConfigurationItem[] = itemType === 'segment' ? data?.segments : data?.subcategories;
    const found = Array.isArray(list) ? list.find((item) => item.id === itemId) : null;
    if (!found) throw new Error('Taxonomy item was not found in the authorized configuration.');
    return {
      id: found.id, descriptionEn: found.description_en || '', descriptionBn: found.description_bn || '',
      shortNameEn: found.short_name_en || '', shortNameBn: found.short_name_bn || '', slug: found.slug || undefined,
    };
  }

  async updateTaxonomyConfiguration(itemType: 'segment' | 'subcategory', item: TaxonomyConfiguration): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Taxonomy configuration service is unavailable.');
    const { data, error } = await supabase.rpc('admin_update_taxonomy_configuration', {
      p_item_type: itemType,
      p_item_id: item.id,
      p_payload: {
        descriptionEn: item.descriptionEn.trim(), descriptionBn: item.descriptionBn.trim(),
        ...(itemType === 'segment' ? { shortNameEn: item.shortNameEn?.trim(), shortNameBn: item.shortNameBn?.trim() } : {}),
      },
    });
    if (error || data?.success !== true) throw new Error(error?.message || 'Server rejected taxonomy configuration.');
  }

  /** Publish is deliberate and backend-validated: parent, form, and banner gates are enforced in SQL. */
  async publishTaxonomyItem(itemType: 'segment' | 'subcategory', itemId: string): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase taxonomy service is unavailable.');
    const { data, error } = await supabase.rpc('admin_publish_taxonomy_item', {
      p_item_type: itemType, p_item_id: itemId,
    });
    if (error || data?.success !== true) {
      throw new Error(error?.message || 'Server rejected taxonomy publication. Review required form and banner configuration.');
    }
  }

  /** Creation always produces an inactive draft and never silently publishes. */
  async createTaxonomyItem(input: TaxonomyCreateInput): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase taxonomy service is unavailable.');
    const id = input.id.trim();
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(id)) {
      throw new Error('ID must contain lowercase letters, numbers, and underscores.');
    }
    if (!input.nameEn.trim() || !input.nameBn.trim()) {
      throw new Error('Both bilingual names are required.');
    }
    if (!Number.isInteger(input.order) || input.order < 1 || input.order > 999) {
      throw new Error('Sort order must be an integer from 1 to 999.');
    }
    if (input.itemType === 'subcategory' && !input.parentSegmentId?.trim()) {
      throw new Error('A parent category is required.');
    }
    const { data, error } = await supabase.rpc('admin_create_taxonomy_item', {
      p_item_type: input.itemType,
      p_item_id: id,
      p_parent_segment_id: input.itemType === 'subcategory' ? input.parentSegmentId : null,
      p_name_en: input.nameEn.trim(),
      p_name_bn: input.nameBn.trim(),
      p_sort_order: input.order,
    });
    if (error || data?.success !== true) {
      throw new Error(`Failed to create taxonomy draft: ${error?.message || 'Server rejected the draft.'}`);
    }
  }

  /** Server preserves historical report snapshots and deactivates on move. */
  async moveSubcategory(input: TaxonomyMoveInput): Promise<void> {
    if (!isSupabaseConfigured) throw new Error('Supabase taxonomy service is unavailable.');
    if (!input.subcategoryId.trim() || !input.targetSegmentId.trim()) {
      throw new Error('Subcategory and target category are required.');
    }
    if (!Number.isInteger(input.order) || input.order < 1 || input.order > 999) {
      throw new Error('Sort order must be an integer from 1 to 999.');
    }
    const { data, error } = await supabase.rpc('admin_move_subcategory', {
      p_subcategory_id: input.subcategoryId,
      p_target_segment_id: input.targetSegmentId,
      p_sort_order: input.order,
    });
    if (error || data?.success !== true) {
      throw new Error(`Failed to move subcategory: ${error?.message || 'Server rejected the move.'}`);
    }
  }

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
