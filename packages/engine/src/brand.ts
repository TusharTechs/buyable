/**
 * The Buyable mark, shared by the site and by every document the site produces.
 *
 * Two customers set out on the same journey. The lower path runs the whole way and
 * arrives; the upper one stops at a barrier it cannot get past. That gap is the
 * product. `currentColor` on the tile means it takes the accent from CSS and needs no
 * second version for dark mode.
 *
 * One constant rather than a copy in each renderer, so a report cannot end up wearing
 * an older logo than the page that links to it.
 */
export const BRAND_MARK =
  '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">' +
  '<rect width="32" height="32" rx="8" fill="currentColor"></rect>' +
  '<g stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none">' +
  '<path d="M8 12h9" opacity=".95"></path><path d="M8 20h13"></path></g>' +
  '<rect x="19.6" y="10.6" width="2.8" height="2.8" rx=".6" fill="#fff" opacity=".55"></rect>' +
  '<path d="M20.5 17.2 23.8 20l-3.3 2.8" stroke="#fff" stroke-width="2.6" ' +
  'stroke-linecap="round" stroke-linejoin="round" fill="none"></path></svg>';
