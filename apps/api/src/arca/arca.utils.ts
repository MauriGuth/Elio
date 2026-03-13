function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export function extractXmlTag(xml: string, tagName: string): string | null {
  const escapedTag = escapeRegex(tagName);
  const regex = new RegExp(
    `<(?:[\\w-]+:)?${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${escapedTag}>`,
    'i',
  );
  const match = xml.match(regex);
  return match?.[1]?.trim() ?? null;
}

export function extractXmlBlocks(xml: string, tagName: string): string[] {
  const escapedTag = escapeRegex(tagName);
  const regex = new RegExp(
    `<(?:[\\w-]+:)?${escapedTag}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w-]+:)?${escapedTag}>`,
    'gi',
  );
  const matches = Array.from(xml.matchAll(regex));
  return matches.map((match) => match[1].trim());
}

export function formatArcaDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function normalizeDigits(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

export function roundAmount(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
