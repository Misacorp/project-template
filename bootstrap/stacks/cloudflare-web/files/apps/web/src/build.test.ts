import { describe, expect, it } from 'vitest';
import { buildLabel, parseBuildInfo } from './build.ts';

describe('build info', () => {
  it('parses the config response', () => {
    expect(
      parseBuildInfo({ environment: 'staging', version: 'dev', branch: 'x', extra: 1 }),
    ).toEqual({
      environment: 'staging',
      version: 'dev',
      branch: 'x',
    });
    expect(parseBuildInfo({ environment: 'staging' })).toBeNull();
    expect(parseBuildInfo('nope')).toBeNull();
  });

  it('labels a build', () => {
    const sha = 'a'.repeat(40);
    expect(buildLabel({ environment: 'production', version: sha, branch: 'main' })).toBe(
      'production · aaaaaaa',
    );
    expect(buildLabel({ environment: 'staging', version: 'dev', branch: 'feat' })).toBe(
      'staging · feat · dev',
    );
  });
});
