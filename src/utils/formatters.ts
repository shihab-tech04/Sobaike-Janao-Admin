/**
 * Common formatting helpers
 */
export const formatDate = (dateString?: string): string => {
  if (!dateString) return '—';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? dateString : d.toLocaleDateString();
  } catch {
    return dateString;
  }
};

export const truncate = (str?: string, maxLen = 50): string => {
  if (!str) return '';
  return str.length > maxLen ? `${str.slice(0, maxLen)}...` : str;
};
