import { describe, expect, it } from 'vitest';
import { isLocalhostHost } from '../localDev';

describe('localDev', () => {
  it('detects localhost variants', () => {
    expect(isLocalhostHost('localhost')).toBe(true);
    expect(isLocalhostHost('127.0.0.1')).toBe(true);
    expect(isLocalhostHost('::1')).toBe(true);
  });

  it('rejects non-local hosts', () => {
    expect(isLocalhostHost('erprevo.com')).toBe(false);
    expect(isLocalhostHost('deploy-preview-123--erprevo.netlify.app')).toBe(false);
  });
});

