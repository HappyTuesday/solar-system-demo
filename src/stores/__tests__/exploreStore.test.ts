import { describe, expect, it } from 'vitest';
import { useExploreStore } from '../exploreStore';

describe('exploreStore', () => {
  it('starts exploration at real-time scale until the user changes time controls', () => {
    useExploreStore.getState().reset();

    expect(useExploreStore.getState().timeScale).toBe(1);
  });
});
