/** What the Worker's /api/config says about the deployed build. */
export interface BuildInfo {
  environment: string;
  version: string;
  branch: string;
}

/** Checks an /api/config response; anything unexpected is null (the page then shows no build line). */
export function parseBuildInfo(value: unknown): BuildInfo | null {
  if (typeof value !== 'object' || value === null) return null;
  const { environment, version, branch } = value as Record<string, unknown>;
  if (
    typeof environment !== 'string' ||
    typeof version !== 'string' ||
    typeof branch !== 'string'
  ) {
    return null;
  }
  return { environment, version, branch };
}

/** "staging · my-branch · 1a2b3c4" (production leaves the branch out). */
export function buildLabel(info: BuildInfo): string {
  const short = /^[0-9a-f]{40}$/.test(info.version) ? info.version.slice(0, 7) : info.version;
  return info.environment === 'production'
    ? `${info.environment} · ${short}`
    : `${info.environment} · ${info.branch} · ${short}`;
}
