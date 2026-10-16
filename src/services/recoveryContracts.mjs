const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const records = (value) => Array.isArray(value) ? value.filter(isRecord) : [];

export function normalizeNewsIntakeDashboard(value) {
  const payload = isRecord(value) ? value : {};
  return {
    sources: records(payload.sources),
    runs: records(payload.runs).map((run) => ({
      ...run,
      items: records(run.items),
    })),
    automation: isRecord(payload.automation) ? payload.automation : {},
  };
}

export function normalizeNewsIntakeTaxonomy(value) {
  const payload = isRecord(value) ? value : {};
  return {
    segments: records(payload.segments),
    subcategories: records(payload.subcategories),
  };
}

export function normalizeBannerRows(value) {
  return records(value).flatMap((row) => {
    if (typeof row.category_key !== 'string' || !row.category_key.trim()) return [];
    return [{
      category_key: row.category_key.trim(),
      draft_content: isRecord(row.draft_content) ? row.draft_content : {},
      published_content: isRecord(row.published_content) ? row.published_content : {},
      draft_updated_at: typeof row.draft_updated_at === 'string' ? row.draft_updated_at : null,
      published_at: typeof row.published_at === 'string' ? row.published_at : null,
      version: Number.isFinite(Number(row.version)) ? Number(row.version) : 0,
    }];
  });
}

export function normalizeSystemHealthPayload(value) {
  if (!isRecord(value)) throw new Error('System health returned an invalid response.');
  if (!isRecord(value.live)) throw new Error('System health did not return live probe data.');
  return value;
}

export function summarizeNewsRun(run) {
  const items = records(run?.items);
  return {
    itemCount: items.length,
    reviewCount: Number(run?.reviewCount) || 0,
    errorCount: Number(run?.errorCount) || 0,
    createdCount: Number(run?.createdCount) || 0,
    mergedCount: Number(run?.mergedCount) || 0,
  };
}
