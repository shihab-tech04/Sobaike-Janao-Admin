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
import { normalizeNewsSourcePreview } from '@/services/newsIntakeWorkflow.mjs';

const ensureConfigured = () => {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase is not configured in this environment.');
  }
};

const readRpc = async (name: string, args: Record<string, unknown> = {}): Promise<unknown> => {
  ensureConfigured();
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(error.message || `Unable to read ${name}.`);
  return data;
};

type RecoveryWriteOutcome = 'rejected' | 'unknown';
type RecoveryWriteError = Error & { outcome: RecoveryWriteOutcome };

const writeError = (message: string, sqlState?: string): RecoveryWriteError => {
  const error = new Error(message) as RecoveryWriteError;
  error.outcome = typeof sqlState === 'string' && /^[0-9A-Z]{5}$/.test(sqlState)
    ? 'rejected'
    : 'unknown';
  return error;
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

  async scanNewsIntake(): Promise<Record<string, unknown>> {
    ensureConfigured();
    const { data, error } = await supabase.functions.invoke('news-intake-scan', { body: {} });
    if (error) throw new Error(error.message || 'News sources could not be scanned.');
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('News Intake scan returned an invalid response.');
    }
    return data as Record<string, unknown>;
  },

  async getNewsSourcePreview(url: string) {
    ensureConfigured();
    const { data, error } = await supabase.functions.invoke('news-intake-fetch', {
      body: { url },
    });
    if (error) throw new Error(error.message || 'The approved source preview could not be loaded.');
    const preview = normalizeNewsSourcePreview(data);
    if (!preview) throw new Error('The source preview did not pass the approved HTTPS source checks.');
    return preview;
  },

  async previewSourcedReport(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const result = await readRpc('admin_preview_sourced_report_intake', { p_payload: payload });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('The sourced report preview returned an invalid response.');
    }
    return result as Record<string, unknown>;
  },

  async checkNewsSourceDuplicate(canonicalUrl: string): Promise<Record<string, unknown>> {
    const result = await readRpc('admin_check_source_duplicate', { p_canonical_url: canonicalUrl });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('The linked source status could not be verified.');
    }
    return result as Record<string, unknown>;
  },

  async createSourcedReport(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    ensureConfigured();
    const { data, error } = await supabase.rpc('admin_create_sourced_report_from_intake', { p_payload: payload });
    if (error) {
      throw writeError(error.message || 'The sourced report could not be created.', error.code);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw writeError('The sourced report creation result could not be confirmed.');
    }
    return data as Record<string, unknown>;
  },

  async completeNewsItemReview(itemId: string, reportId: string): Promise<Record<string, unknown>> {
    ensureConfigured();
    const { data, error } = await supabase.rpc('admin_complete_news_intake_item_review', {
      p_item_id: itemId,
      p_report_id: reportId,
    });
    if (error) {
      throw writeError(error.message || 'News Intake review could not be confirmed.', error.code);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw writeError('News Intake review returned an invalid response.');
    }
    return data as Record<string, unknown>;
  },

  async publishSourcedReport(reportId: string): Promise<Record<string, unknown>> {
    ensureConfigured();
    const { data, error } = await supabase.rpc('admin_publish_complaint', {
      p_complaint_id: reportId,
    });
    if (error) {
      throw writeError(error.message || 'The report could not be published.', error.code);
    }
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw writeError('The report publication result could not be confirmed.');
    }
    const result = data as Record<string, unknown>;
    if (result.success !== true || result.status !== 'published') {
      throw writeError('The report publication result could not be confirmed.');
    }
    return result;
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
