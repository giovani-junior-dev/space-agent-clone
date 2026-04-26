import {
  loadMaterialSymbolNames as loadMaterialSymbolNamesFromVisual,
  normalizeIconHexColor,
  normalizeMaterialSymbolName
} from "/mod/_core/visual/icons/material-symbols.js";

export const UNTITLED_SPACE_LABEL = "Untitled";
export const DEFAULT_SPACE_ICON = "space_dashboard";
export const DEFAULT_SPACE_ICON_COLOR = "#94bcff";

function normalizeLineEndings(value) {
  return String(value ?? "").replace(/\r\n/gu, "\n").replace(/\r/gu, "\n");
}

function readMetadataValue(value, key, fallbackKey = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  if (fallbackKey && value[fallbackKey] !== undefined) {
    return value[fallbackKey];
  }

  return value[key];
}

export function normalizeSpaceTitle(value) {
  return String(value ?? "").trim();
}

/**
 * Resolve a localized field from a space manifest or record.
 *
 * Looks up `${fieldName}_i18n[locale]` (and the camelCase `${fieldName}I18n`
 * fallback) on the supplied record. If no localized variant is found the
 * raw `fieldName` value is returned, preserving the EN fallback contract.
 *
 * Safe for any input — returns `""` when the record is null/undefined or
 * not an object. Never throws.
 *
 * @param {object} record  - Space manifest, runtime record, or YAML metadata.
 * @param {string} fieldName - Base field key (e.g. "title", "description").
 * @param {string} [locale] - Target locale (e.g. "pt-BR"). Optional.
 * @returns {*} Localized value if present, otherwise the base field value.
 */
export function localizedField(record, fieldName, locale) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }

  const baseValue = record[fieldName];
  const targetLocale = String(locale || "").trim();

  if (!targetLocale) {
    return baseValue;
  }

  const snakeKey = `${fieldName}_i18n`;
  const camelKey = `${fieldName}I18n`;
  const localizedMap = record[snakeKey] ?? record[camelKey];

  if (
    localizedMap &&
    typeof localizedMap === "object" &&
    !Array.isArray(localizedMap)
  ) {
    const localizedValue = localizedMap[targetLocale];
    if (localizedValue !== undefined && localizedValue !== null && localizedValue !== "") {
      return localizedValue;
    }

    // Try base language fallback (e.g. "pt" for "pt-BR") before giving up.
    const base = targetLocale.split(/[-_]/u)[0];
    if (base && base !== targetLocale && localizedMap[base] !== undefined) {
      const baseLocalized = localizedMap[base];
      if (baseLocalized !== undefined && baseLocalized !== null && baseLocalized !== "") {
        return baseLocalized;
      }
    }
  }

  return baseValue;
}

function normalizeSpaceInstructions(value) {
  return normalizeLineEndings(value).trim();
}

export function normalizeSpaceAgentInstructions(value) {
  return normalizeSpaceInstructions(value);
}

export const normalizeSpaceSpecialInstructions = normalizeSpaceAgentInstructions;

export function normalizeSpaceIcon(value) {
  return normalizeMaterialSymbolName(value);
}

export function normalizeSpaceIconColor(value) {
  return normalizeIconHexColor(value);
}

export function getSpaceDisplayTitle(value, locale = "") {
  const rawTitle = locale
    ? localizedField(value, "title", locale)
    : readMetadataValue(value, "title");
  const normalizedTitle = normalizeSpaceTitle(rawTitle);
  return normalizedTitle || UNTITLED_SPACE_LABEL;
}

/**
 * Resolve a display-ready, locale-aware description for a space record.
 * Returns "" when no description is set (description is optional in the UI).
 */
export function getSpaceDisplayDescription(value, locale = "") {
  const rawDescription = locale
    ? localizedField(value, "description", locale)
    : readMetadataValue(value, "description", "summary");
  return String(rawDescription ?? "")
    .replace(/\s+/gu, " ")
    .trim();
}

export function getSpaceDisplayIcon(value) {
  const normalizedIcon = normalizeSpaceIcon(readMetadataValue(value, "icon"));
  return normalizedIcon || DEFAULT_SPACE_ICON;
}

export function getSpaceDisplayIconColor(value) {
  const normalizedColor = normalizeSpaceIconColor(readMetadataValue(value, "iconColor", "icon_color"));
  return normalizedColor || DEFAULT_SPACE_ICON_COLOR;
}

export async function loadMaterialSymbolNames() {
  return loadMaterialSymbolNamesFromVisual();
}
