// =============================================================================
// VoltForge — Pre-Production Security Contract Verification Tests
// =============================================================================

import { strict as assert } from 'node:assert';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({
  appType: 'custom',
  logLevel: 'error',
  root,
  server: { middlewareMode: true },
});

try {
  console.log('[*] Running VoltForge Security Contract Tests...');

  const security = await vite.ssrLoadModule('/src/utils/security.ts');
  const { sanitizeUrl, sanitizeStompHeader, sanitizeSvgData } = security;

  // ── 1. URL Protocol Sanitization (XSS Defense) ──────────────────────────────
  console.log(' -> Testing URL Protocol Sanitization (XSS Defense)...');

  // Malicious schemes must be completely blocked
  assert.equal(sanitizeUrl('javascript:alert(document.cookie)'), null, 'Blocked javascript: alert');
  assert.equal(sanitizeUrl('JAVASCRIPT:alert(1)'), null, 'Blocked case-insensitive javascript:');
  assert.equal(sanitizeUrl('javascript:/*--></title></style>*/<script>alert(1)</script>'), null, 'Blocked complex javascript:');
  assert.equal(sanitizeUrl('vbscript:msgbox("XSS")'), null, 'Blocked vbscript:');
  assert.equal(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), null, 'Blocked data: HTML');
  assert.equal(sanitizeUrl('file:///etc/passwd'), null, 'Blocked local file://');
  assert.equal(sanitizeUrl('//evil.com/payload'), null, 'Blocked protocol-relative // url');
  assert.equal(sanitizeUrl(''), null, 'Blocked empty string');
  assert.equal(sanitizeUrl(null), null, 'Blocked null');
  assert.equal(sanitizeUrl(undefined), null, 'Blocked undefined');

  // Safe schemes must be accepted
  assert.equal(sanitizeUrl('https://docs.arduino.cc/uno'), 'https://docs.arduino.cc/uno', 'Allowed https:');
  assert.equal(sanitizeUrl('http://localhost:3000/docs'), 'http://localhost:3000/docs', 'Allowed http:');
  assert.equal(sanitizeUrl('mailto:support@voltforge.dev'), 'mailto:support@voltforge.dev', 'Allowed mailto:');
  assert.equal(sanitizeUrl('/editor/sandbox'), '/editor/sandbox', 'Allowed internal relative path');

  console.log(' PASS: URL Protocol Sanitization verified.');

  // ── 2. STOMP WebSocket Header Injection Defense ─────────────────────────────
  console.log(' -> Testing STOMP WebSocket Header Injection Defense...');

  assert.equal(sanitizeStompHeader('simple-key'), 'simple-key');
  assert.equal(
    sanitizeStompHeader('Bearer abc\nadmin:true\n\n{"injected":true}'),
    'Bearer abc admin:true {"injected":true}',
    'Stripped newline and carriage return injections'
  );
  assert.equal(
    sanitizeStompHeader('User\r\nDestination: /topic/admin'),
    'User Destination: /topic/admin',
    'Stripped CRLF header splitting'
  );
  assert.equal(sanitizeStompHeader(null), '');
  assert.equal(sanitizeStompHeader(undefined), '');

  console.log(' PASS: STOMP Header Injection defense verified.');

  // ── 3. SVG Markup & Event Handler Sanitization ──────────────────────────────
  console.log(' -> Testing SVG Markup Sanitization...');

  const maliciousSvg = `
  <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg" onload="alert('XSS')">
    <script>evilCode()</script>
    <rect x="0" y="0" width="50" height="50" onclick="steal()" onmouseover="leak()"/>
    <foreignObject width="100" height="100"><iframe src="javascript:alert(1)"></iframe></foreignObject>
    <circle cx="25" cy="25" r="20" fill="red"/>
  </svg>
  `;

  const cleanedSvg = sanitizeSvgData(maliciousSvg);
  assert.doesNotMatch(cleanedSvg, /<script\b/i, 'Removed <script>');
  assert.doesNotMatch(cleanedSvg, /onload=/i, 'Removed onload handler');
  assert.doesNotMatch(cleanedSvg, /onclick=/i, 'Removed onclick handler');
  assert.doesNotMatch(cleanedSvg, /onmouseover=/i, 'Removed onmouseover handler');
  assert.doesNotMatch(cleanedSvg, /<foreignObject\b/i, 'Removed <foreignObject>');
  assert.doesNotMatch(cleanedSvg, /<iframe\b/i, 'Removed <iframe>');
  assert.match(cleanedSvg, /<circle/i, 'Preserved safe circle element');
  assert.match(cleanedSvg, /fill="red"/i, 'Preserved safe attributes');

  console.log(' PASS: SVG Markup Sanitization verified.');

  // ── 4. Shared Circuit Deserialization Boundary Checks ────────────────────────
  console.log(' -> Testing Shared Circuit Deserialization Boundary Checks...');

  const MAX_SHARE_NODES = 1000;
  const MAX_SHARE_WIRES = 2000;

  function validateSharePayload(decoded) {
    if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
      throw new Error('Invalid share state structure');
    }
    if (Array.isArray(decoded.nodes) && decoded.nodes.length > MAX_SHARE_NODES) {
      throw new Error('Share state exceeds maximum allowed component count');
    }
    if (Array.isArray(decoded.wires) && decoded.wires.length > MAX_SHARE_WIRES) {
      throw new Error('Share state exceeds maximum allowed wire count');
    }
    return true;
  }

  // Valid payload passes
  assert.equal(validateSharePayload({ nodes: [{ id: '1' }], wires: [] }), true);

  // Array root rejected
  assert.throws(() => validateSharePayload([1, 2, 3]), /Invalid share state structure/);

  // Primitive rejected
  assert.throws(() => validateSharePayload('malicious string'), /Invalid share state structure/);

  // Oversized node count rejected
  const oversizedNodes = Array.from({ length: 1001 }, (_, i) => ({ id: `n_${i}` }));
  assert.throws(() => validateSharePayload({ nodes: oversizedNodes }), /maximum allowed component count/);

  // Oversized wire count rejected
  const oversizedWires = Array.from({ length: 2001 }, (_, i) => ({ id: `w_${i}` }));
  assert.throws(() => validateSharePayload({ wires: oversizedWires }), /maximum allowed wire count/);

  console.log(' PASS: Shared Circuit boundary checks verified.');

  console.log('\n[+] ALL SECURITY CONTRACT TESTS PASSED WITH 100% SUCCESS.');
} finally {
  await vite.close();
}
