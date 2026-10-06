/**
 * Public web pages of the app. Source of truth: `docs/site/` here; published from the separate public
 * repo `DanielArpadfalvi/swaplight-site` (GitHub Pages, `scripts/publish-site.sh`). The store
 * listings use the same URLs (see `docs/RELEASE.md` 6.3).
 */

const SITE = 'https://danielarpadfalvi.github.io/swaplight-site';

export const PRIVACY_URL = `${SITE}/privacy.html`;
export const SUPPORT_URL = `${SITE}/support.html`;
/** Public support address (also on the support / privacy pages and in the store listings). */
export const SUPPORT_EMAIL = 'swaplight.support@gmail.com';
export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Swaplight support')}`;
/** Terms of use: Apple's standard licensed application EULA (used on both stores for 1.0). */
export const TERMS_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
