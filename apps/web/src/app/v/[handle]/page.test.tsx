import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { resolveHandleMock, router } = vi.hoisted(() => ({
  resolveHandleMock: vi.fn(),
  router: { replace: vi.fn() },
}));

vi.mock('@/lib/registry', () => ({
  resolveHandle: resolveHandleMock,
  getMeta: () => Promise.resolve(null),
}));
vi.mock('@/lib/constellation', () => ({
  getPeopleCounts: () => Promise.resolve({ vouchedBy: 0, backed: 0 }),
}));
vi.mock('@/components/wallet/wallet-provider', () => ({ useWallet: () => ({ profile: null }) }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

import InvitePage from './page';

const KEY = 'alvinmunk.ref';
const BOB = 'GBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOB';

describe('/v/[handle] invite ref', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
    router.replace.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.clearAllMocks();
  });

  async function visit(handle: string) {
    await act(async () => {
      root.render(<InvitePage params={{ handle }} />);
    });
  }

  it('stores a claimed handle, normalized, once it resolves', async () => {
    resolveHandleMock.mockResolvedValue(BOB);
    await visit('Bob');
    expect(resolveHandleMock).toHaveBeenCalledWith('bob');
    expect(sessionStorage.getItem(KEY)).toBe('bob');
  });

  it('never stores an unclaimed handle', async () => {
    resolveHandleMock.mockResolvedValue(null);
    await visit('nobody');
    expect(resolveHandleMock).toHaveBeenCalledWith('nobody');
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('does not store the handle while it is still resolving, or when the lookup fails', async () => {
    let fail!: (e: Error) => void;
    resolveHandleMock.mockReturnValue(new Promise((_, reject) => (fail = reject)));
    await visit('bob');
    expect(sessionStorage.getItem(KEY)).toBeNull();
    await act(async () => fail(new Error('rpc down')));
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('keeps an earlier inviter when the new link is unclaimed', async () => {
    sessionStorage.setItem(KEY, 'carol');
    resolveHandleMock.mockResolvedValue(null);
    await visit('nobody');
    expect(sessionStorage.getItem(KEY)).toBe('carol');
  });

  it('redirects an @-prefixed handle to its canonical invite path', async () => {
    await visit('@alice');
    expect(router.replace).toHaveBeenCalledWith('/v/alice');
    expect(resolveHandleMock).not.toHaveBeenCalled();
  });

  it('renders an invalid-handle state instead of an invite', async () => {
    await visit('a-b');
    expect(container.textContent).toContain('profile.invalidHandle');
    expect(resolveHandleMock).not.toHaveBeenCalled();
  });
});
