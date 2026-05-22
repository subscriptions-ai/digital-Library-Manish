import crypto from 'crypto';

/**
 * Generates a SHA-256 fingerprint from the title and authors of a content item.
 * Used for strict deduplication checks.
 */
export function generateFingerprint(title: string, authors: string): string {
  const normalizedTitle = (title || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')    // Strip special chars
    .replace(/\s+/g, ' ')            // Normalize whitespace
    .trim();
  
  const normalizedAuthors = (authors || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, '')
    .split(',')
    .map(a => a.trim())
    .sort()
    .join(',');
  
  return crypto
    .createHash('sha256')
    .update(`${normalizedTitle}::${normalizedAuthors}`)
    .digest('hex');
}
