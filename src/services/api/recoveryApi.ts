import { supabase, isSupabaseConfigured } from '@/lib/supabase';
import {
  normalizeBannerRows,
  normalizeNewsIntakeDashboard,
  normalizeNewsIntakeTaxonomy,
  normalizeSystemHealthPayload,
  NormalizedBannerRow,
  NormalizedNewsDashboard,
  NormalizedNewsTaxonomy,
  NormalizedSystemHealthPayload,
} from '@/services/recoveryContracts.mjs';

const ensureConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured in this environment.');
  }
};

const readRpc = async (name: string): Promise<unknown> => {
  ensureConfigured();
  const { data, error } = await supabase.rpc(name);
  if (error) throw new Error(error.message || `Unable to read ${name}.`);
  return data;
};

export const recoveryApi = {
  async getNewsIntake(): Promise<{
    dashboard: NormalizedNewsDashboard;
    scanSources: Record<string, unknown>[];
    taxonomy: NormalizedNewsTaxonomy;
  }> {
    const [dashboardRaw, scanSourcesRaw, taxonomyRaw] = await Promise.all([
      readRpc('admin_get_news_intake_automation_dashboard'),
      readRpc('admin_get_news_intake_scan_sources'),
      readRpc('admin_get_news_intake_taxonomy'),
    ]);

    return {
      dashboard: normalizeNewsIntakeDashboard(dashboardRaw),
      scanSources: Array.isArray(scanSourcesRaw)
        ? scanSourcesRaw.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object')
        : [],
      taxonomy: normalizeNewsIntakeTaxonomy(taxonomyRaw),
    };
  },

  async getBannerRows(): Promise<NormalizedBannerRow[]> {
    return normalizeBannerRows(await readRpc('admin_get_site_banners'));
  },

  async saveBannerDraft(categoryKey: string, content: Record<string, unknown>): Promise<unknown> {
    ensureConfigured();
    const { data, error } = await supabase.rpc('admin_save_banner_draft', {
      p_category_key: categoryKey,
      p_content: content,
    });
    if (error) throw new Error(error.message || 'Banner draft could not be saved.');
    return data;
  },

  async publishBanner(categoryKey: string): Promise<unknown> {
    ensureConfigured();
    const { data, error } = await supabase.rpc('admin_publish_banner', {
      p_category_key: categoryKey,
    });
    if (error) throw new Error(error.message || 'Banner could not be published.');
    return data;
  },

  async getSystemHealth(): Promise<NormalizedSystemHealthPayload> {
    ensureConfigured();
    const { data, error } = await supabase.functions.invoke('admin-system-health', {
      body: { mode: 'read' },
    });
    if (error) throw new Error(error.message || 'System health could not be loaded.');
    return normalizeSystemHealthPayload(data);
  },
};
