// Simple debug helpers to trace module evaluation and component mount/unmount.
// Enable via: localStorage.setItem('DEBUG_LOAD','1') and reload, or set VITE_DEBUG_LOAD=1 in env.

export const DEBUG_LOAD: boolean =
  typeof window !== 'undefined' && (
    window.localStorage.getItem('DEBUG_LOAD') === '1' ||
    (import.meta as any)?.env?.VITE_DEBUG_LOAD === '1'
  );

export function logModule(name: string) {
  if (DEBUG_LOAD) console.log(`[module] ${name}`);
}

export function logInfo(message: string, data?: unknown) {
  if (DEBUG_LOAD) console.log(`[info] ${message}`, data ?? '');
}

export function useLogMount(name: string) {
  // Dynamic import to avoid hard dep on React for non-React call sites
  // Consumers in React components will call this; in non-React modules do nothing
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const React = require('react');
    const { useEffect } = React as typeof import('react');
    useEffect(() => {
      if (DEBUG_LOAD) console.log(`[mount] ${name}`);
      return () => {
        if (DEBUG_LOAD) console.log(`[unmount] ${name}`);
      };
    }, []);
  } catch {
    // ignore when React not available
  }
}

// Logs all active stylesheets and their rule counts. Useful to verify CSS loading.
export function logStylesheets() {
  if (typeof document === 'undefined' || !DEBUG_LOAD) return;
  try {
    const sheets = Array.from(document.styleSheets || []);
    const rows = sheets.map((s) => {
      let rules = 0;
      try {
        // Accessing cssRules may throw for cross-origin sheets
        rules = (s as CSSStyleSheet).cssRules ? (s as CSSStyleSheet).cssRules.length : 0;
      } catch {
        rules = -1; // indicate inaccessible
      }
      const sheet = s as CSSStyleSheet;
      const href = sheet.href;
      const owner = sheet.ownerNode as Element | null;
      const devId = owner && (owner as HTMLElement).getAttribute?.('data-vite-dev-id');
      const src = href ?? devId ?? (owner ? owner.tagName.toLowerCase() : 'inline');
      return { src, rules };
    });
    console.log('[styles] Loaded stylesheets (rules = -1 means inaccessible due to CORS):');
    // console.table can be collapsed in some consoles, keep a normal log too
    try { console.table(rows); } catch { /* ignore if not supported */ }
    console.log(rows);
  } catch (err) {
    console.warn('[styles] Unable to enumerate stylesheets:', err);
  }
}

function getLoadedStylesheetIds(): Array<[href: string, devId: string]> {
  const sheets = Array.from(document.styleSheets || []);
  return sheets.map((s) => {
    const sheet = s as CSSStyleSheet;
    const href = sheet.href || '';
    const owner = sheet.ownerNode as Element | null;
    const devId = owner && (owner as HTMLElement).getAttribute?.('data-vite-dev-id');
    return [href, devId ?? ''];
  });
}

// Assert that given stylesheet identifiers (module paths, full URLs, hostnames, or regexes in "/re/flags" form)
// are present among loaded sheets (matching by href or data-vite-dev-id). Useful also for external CDNs.
export function assertStylesheets(expected: Array<string | RegExp>) {
  if (typeof document === 'undefined' || !DEBUG_LOAD) return;
  try {
    const ids = getLoadedStylesheetIds();
    const normalize = (x: string | RegExp): RegExp => {
      if (x instanceof RegExp) return x;
      const m = x.match(/^\/(.*)\/(\w*)$/);
      if (m) return new RegExp(m[1], m[2]);
      // Treat bare hostname as wildcard against href
      const pattern = x.replace(/^\//, '');
      return new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    };

    const missing: string[] = [];
    for (const exp of expected) {
      const rx = normalize(exp);
      const found = ids.some(([href, devId]) => rx.test(href) || rx.test(devId));
      if (!found) missing.push(String(exp));
    }

    if (missing.length > 0) {
      console.warn('[styles] Missing expected stylesheets:', missing);
    } else if (expected.length > 0) {
      console.log('[styles] All expected stylesheets are present.');
    }
  } catch (err) {
    console.warn('[styles] Unable to assert stylesheets:', err);
  }
}

// Read additional expected stylesheet identifiers from localStorage/ENV and assert them (e.g., external CDNs).
export function assertStylesheetsFromEnv() {
  if (typeof document === 'undefined' || !DEBUG_LOAD) return;
  try {
    const raw = (typeof window !== 'undefined' && window.localStorage.getItem('DEBUG_EXPECT_STYLES'))
      || (import.meta as any)?.env?.VITE_DEBUG_EXPECT_STYLES
      || '';
    if (!raw) return;
    const list = raw.split(',').map(s => s.trim()).filter(Boolean);
    if (list.length === 0) return;
    assertStylesheets(list);
  } catch (err) {
    console.warn('[styles] Unable to assert stylesheets from env:', err);
  }
}

