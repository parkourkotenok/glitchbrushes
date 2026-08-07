import packageMetadata from '../../package.json';

export const PRODUCT_NAME = 'imgfuck';
export const PRODUCT_SUBTITLE = 'local image destruction toy';
export const BROWSER_TITLE = `${PRODUCT_NAME} — ${PRODUCT_SUBTITLE}`;
export const PRODUCT_VERSION = packageMetadata.version;
export const PRODUCT_ABOUT =
  'A local image corruption and glitch playground. PNG / JPEG / WebP. Everything runs on your machine.';

export const STORAGE_KEYS = {
  presets: 'imgfuck.custom-presets.v1',
  moshPresets: 'imgfuck-mosh-presets-v1',
  imageBrushPresets: 'imgfuck:image-brush-presets:v1',
} as const;

export const LEGACY_STORAGE_KEYS = {
  presets: 'hex-redactor.custom-presets.v1',
  moshPresets: 'hex-redactor-mosh-presets-v1',
  imageBrushPresets: 'hex-redactor:image-brush-presets:v1',
} as const;
