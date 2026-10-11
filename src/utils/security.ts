/**
 * =============================================================================
 * VoltForge — Client-Side Security Utilities
 * =============================================================================
 */

/**
 * Sanitizes URLs to prevent Cross-Site Scripting (XSS) via javascript:, vbscript:,
 * data: or other dangerous protocol schemes.
 * Only allows safe web protocols: http, https, and mailto.
 */
export function sanitizeUrl(rawUrl: unknown): string | null {
  if (typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Explicitly disallow dangerous executable or non-standard protocol handlers
  if (/^(javascript|vbscript|data|file):/i.test(trimmed)) {
    return null;
  }

  // Allow absolute HTTP/HTTPS or mailto URLs
  if (/^(https?:|mailto:)/i.test(trimmed)) {
    return trimmed;
  }

  // Allow relative URLs that start with / (internal navigation)
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) {
    return trimmed;
  }

  return null;
}

/**
 * Sanitizes header values for STOMP WebSocket frames.
 * Strips carriage returns and newlines to prevent frame splitting and header injection.
 */
export function sanitizeStompHeader(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

/**
 * Sanitizes SVG source markup to prevent script execution or dangerous tags.
 * Strips <script>, <foreignObject>, <object>, <iframe>, and on* event handlers.
 */
export function sanitizeSvgData(svg: unknown): string {
  if (typeof svg !== 'string') return '';
  const trimmed = svg.trim();
  if (!trimmed) return '';
  return trimmed
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<foreignObject\b[^<]*(?:(?!<\/foreignObject>)<[^<]*)*<\/foreignObject>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
    .replace(/\son\w+\s*=\s*(['"]).*?\1/gi, '')
    .replace(/\son\w+\s*=\s*[^>\s]+/gi, '');
}

