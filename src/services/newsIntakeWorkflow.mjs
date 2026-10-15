const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const asText = (value) => typeof value === 'string' ? value.trim() : '';

export function getManualNewsCandidates(run) {
  if (!isRecord(run) || run.triggerType !== 'manual' || !Array.isArray(run.items)) return [];

  return run.items.filter((item) => {
    if (!isRecord(item)) return false;
    const payload = item.reviewPayload;
    const sourceUrl = asText(payload?.source?.canonicalUrl);
    const itemUrl = asText(item.canonicalUrl);
    return item.itemKind === 'article'
      && item.action === 'created_draft'
      && item.duplicateStatus === 'clear'
      && !asText(item.reportId)
      && asText(item.id) !== ''
      && isRecord(payload)
      && isRecord(payload.source)
      && isRecord(payload.report)
      && sourceUrl !== ''
      && sourceUrl === itemUrl;
  });
}

export function normalizeNewsSourcePreview(value) {
  if (!isRecord(value) || value.approved !== true) return null;

  const canonicalUrl = asText(value.canonicalUrl);
  try {
    const parsed = new URL(canonicalUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) return null;
  } catch {
    return null;
  }

  return {
    approved: true,
    publisherName: asText(value.publisherName),
    sourceTitle: asText(value.sourceTitle),
    canonicalUrl,
    sourcePublishedDate: asText(value.sourcePublishedDate) || null,
    descriptionPreview: asText(value.descriptionPreview).slice(0, 500),
    hostname: asText(value.hostname),
  };
}

export function isPublishableSourcedReportPreview(value) {
  return isRecord(value)
    && value.canCreateDraft === true
    && value.canPublishImmediately === true
    && isRecord(value.schemaValidation)
    && value.schemaValidation.ready === true
    && isRecord(value.duplicate)
    && value.duplicate.status === 'clear';
}

const errorText = (error) => error instanceof Error ? error.message : 'The selected source could not be published.';

/**
 * Runs the protected review/publication contracts in order. Every selected item
 * is preflighted before the first write, and an item is published only after
 * the server confirms the manual review is still ready.
 */
export async function publishSelectedNewsCandidates(items, actions) {
  const uniqueItems = [];
  const seenIds = new Set();
  for (const item of Array.isArray(items) ? items : []) {
    const id = asText(item?.id);
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    uniqueItems.push(item);
  }

  if (uniqueItems.length === 0) {
    return { published: [], blocked: [], writesStarted: false };
  }

  const checks = await Promise.all(uniqueItems.map(async (item) => {
    try {
      const preview = await actions.previewSourcedReport(item.reviewPayload);
      return isPublishableSourcedReportPreview(preview)
        ? { item, ready: true }
        : { item, ready: false, reason: 'The current source, duplicate, form, or privacy checks do not allow publication.' };
    } catch (error) {
      return { item, ready: false, reason: errorText(error) };
    }
  }));

  const preflightBlocked = checks.filter((check) => !check.ready).map(({ item, reason }) => ({
    itemId: asText(item.id),
    reason,
  }));

  if (preflightBlocked.length > 0) {
    return { published: [], blocked: preflightBlocked, writesStarted: false };
  }

  const published = [];
  const blocked = [];
  for (const { item } of checks) {
    try {
      const created = await actions.createSourcedReport(item.reviewPayload);
      const reportId = asText(created?.reportId ?? created?.report_id);
      if (!reportId) throw new Error('The source contract returned no report ID.');

      const review = await actions.completeItemReview(asText(item.id), reportId);
      if (review?.ready !== true) {
        blocked.push({
          itemId: asText(item.id),
          reportId,
          reason: 'The server review is no longer ready. The report remains unpublished.',
        });
        continue;
      }

      await actions.publishComplaint(reportId);
      published.push({ itemId: asText(item.id), reportId });
    } catch (error) {
      blocked.push({ itemId: asText(item.id), reason: errorText(error) });
    }
  }

  return { published, blocked, writesStarted: true };
}
