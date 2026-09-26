// =============================================================================
// Browser Polyfills
// =============================================================================

// Polyfill crypto.randomUUID for non-secure HTTP contexts if not natively supported
if (typeof window !== 'undefined' && window.crypto && !window.crypto.randomUUID) {
  (window.crypto as { randomUUID?: () => `${string}-${string}-${string}-${string}-${string}` }).randomUUID = function () {
    return '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c: string) => {
      const num = parseInt(c, 10);
      return (
        (num ^ (window.crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (num / 4)))).toString(16)
      );
    }) as `${string}-${string}-${string}-${string}-${string}`;
  };
}
