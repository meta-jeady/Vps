export const DEFAULT_VLESS_TEMPLATE =
  'vless://d8a6b1c2-3f4e-4a5b-8c9d-1e2f3a4b5c6d@google.am:443?encryption=none&security=tls&sni=crashlyticsreports-pa.googleapis.com&type=ws&host=mon host ici &path=%2F@kcorp-tech237#@KCORP-TECH';

export const DEFAULT_HOST_PLACEHOLDER = 'm.orange.cm';

export function generateDeviceId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const pick = (len: number) =>
    Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `OR-${pick(4)}-${pick(4)}`;
}

export function isValidAppId(id: string): boolean {
  return /^(OR|XV)-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(id.trim().toUpperCase());
}

/**
 * Injects the configured Host cleanly into the VLESS URI at `host=...`,
 * replacing `mon host ici ` or `{{HOST}}` or any existing `host` parameter
 * while preserving the rest of the VLESS engine link intact.
 */
export function buildVlessWithHost(template: string, rawHost: string): string {
  const cleanHost = rawHost.trim();
  const base = (template || DEFAULT_VLESS_TEMPLATE).trim();

  if (!cleanHost) return base;

  // Replace explicit placeholder tokens first if present
  if (base.includes('{{HOST}}')) {
    return base.replace(/\{\{HOST\}\}/g, encodeURIComponent(cleanHost));
  }

  try {
    // Parse and rebuild query parameter `host` cleanly while preserving hash & path
    const hashIndex = base.indexOf('#');
    const withoutHash = hashIndex >= 0 ? base.slice(0, hashIndex) : base;
    const hashPart = hashIndex >= 0 ? base.slice(hashIndex) : '';

    const qIndex = withoutHash.indexOf('?');
    if (qIndex < 0) {
      return `${withoutHash}?host=${encodeURIComponent(cleanHost)}${hashPart}`;
    }

    const prefix = withoutHash.slice(0, qIndex);
    const queryStr = withoutHash.slice(qIndex + 1);
    const parts = queryStr.split('&').filter(Boolean);
    let foundHost = false;
    const nextParts = parts.map((pair) => {
      const eqIdx = pair.indexOf('=');
      const key = eqIdx >= 0 ? pair.slice(0, eqIdx) : pair;
      if (key.toLowerCase() === 'host') {
        foundHost = true;
        return `host=${encodeURIComponent(cleanHost)}`;
      }
      return pair;
    });

    if (!foundHost) {
      nextParts.push(`host=${encodeURIComponent(cleanHost)}`);
    }

    return `${prefix}?${nextParts.join('&')}${hashPart}`;
  } catch {
    return base.replace(/host=[^&#]*/i, `host=${encodeURIComponent(cleanHost)}`);
  }
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function addDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, Math.round(days)));
  return d.toISOString().split('T')[0];
}
