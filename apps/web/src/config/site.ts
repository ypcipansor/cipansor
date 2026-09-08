/**
 * Public-facing data for Yayasan Pesantren Cipansor.
 *
 * The constants themselves moved to `@cipansor/shared` (`src/public-site.ts`)
 * once the API needed them too: the public chatbot builds its knowledge base
 * from these exact values, so the bot and the pages cannot state different
 * facts. Editing rules are unchanged and documented there — every figure must
 * be verifiable, and the bank details are financial data, never placeholders.
 *
 * This file stays as the web app's import surface so the 26 modules that use
 * `@/config/site` keep working unchanged.
 */

export {
  siteConfig,
  addressLines,
  educationUnits,
  featuredPrograms,
  donationConfig,
  galleryItems,
  galleryThumb,
  PUBLIC_VERIFY_URL_PATH,
  getPublicVerifyUrl,
} from "@cipansor/shared";
export type { GalleryPhoto } from "@cipansor/shared";
