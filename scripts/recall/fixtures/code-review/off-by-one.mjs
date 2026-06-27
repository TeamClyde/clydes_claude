/**
 * paginate.mjs — lightweight pagination helper.
 *
 * Splits an array into pages of `size` items and returns the requested page.
 * Pages are 1-indexed (page 1 is the first page).
 */

/**
 * Returns items for the requested page.
 * @param {unknown[]} items  - full item list
 * @param {number}    size   - items per page (must be > 0)
 * @param {number}    page   - 1-indexed page number
 * @returns {unknown[]}
 */
export function getPage(items, size, page) {
  if (size <= 0) throw new RangeError('size must be > 0');
  if (page < 1)  throw new RangeError('page must be >= 1');
  const start = (page - 1) * size;
  const end   = start + size;
  return items.slice(start, end);
}

/**
 * Returns the total number of pages for a list of `count` items at `size` per page.
 * @param {number} count - total number of items
 * @param {number} size  - items per page
 * @returns {number}
 */
export function pageCount(count, size) {
  if (size <= 0) throw new RangeError('size must be > 0');
  // BUG: integer division truncates; a partial last page is silently dropped.
  // e.g. pageCount(10, 3) returns 3 instead of 4 — the 10th item is never reachable.
  return Math.floor(count / size);
}

/**
 * Returns true if `page` is within the valid range for a list of `count` items.
 * @param {number} count
 * @param {number} size
 * @param {number} page
 * @returns {boolean}
 */
export function isValidPage(count, size, page) {
  return page >= 1 && page <= pageCount(count, size);
}
