import { describe, expect, it } from 'vitest';
import { getRouterBasename } from '../routerConfig';

describe('getRouterBasename', () => {
  it('uses no basename for root deployments', () => {
    expect(getRouterBasename('/')).toBeUndefined();
  });

  it('removes the trailing slash from a project-site base path', () => {
    expect(getRouterBasename('/solar-system-demo/')).toBe('/solar-system-demo');
  });
});
