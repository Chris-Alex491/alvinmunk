import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { resolveHandleMock, replaceMock } = vi.hoisted(() => ({
  resolveHandleMock: vi.fn(),
  replaceMock: vi.fn(),
}));

vi.mock('@/lib/registry', () => ({
  resolveHandle: resolveHandleMock,
  getMeta: () => Promise.resolve(null),
}));
vi.mock('@/lib/constellation', () => ({
  getPeopleCounts: () => Promise.resolve({ vouchedBy: 0, backed: 0 }),
}));
vi.mock('@/components/wallet/wallet-provider', () => ({ useWallet: () => ({ profile: null }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: replaceMock }) }));

import InvitePage from './page';

const KEY = 'alvinmunk.ref';
const BOB = 'GBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOBBOB';

describe('/v/[handle] invite ref', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    sessionStorage.clear();
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

  it('keeps the invite but claims nothing about the inviter when the lookup fails (#188)', async () => {
    resolveHandleMock.mockRejectedValueOnce(new Error('rpc down')).mockResolvedValueOnce(BOB);
    await visit('bob');
    expect(container.textContent).toContain('Couldn’t look this handle up right now.');
    expect(container.textContent).not.toContain('new to the sky');
    expect(container.textContent).not.toContain('be their first');
    expect(container.querySelector('a[href="/app"]')).not.toBeNull(); // the invite still works

    const retry = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Try again')!;
    await act(async () => retry.click());
    expect(resolveHandleMock).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem(KEY)).toBe('bob');
    expect(container.textContent).not.toContain('Couldn’t look this handle up');
  });

  it('redirects /v/@bob to /v/bob without a lookup', async () => {
    await visit('@Bob');
    expect(replaceMock).toHaveBeenCalledWith('/v/bob');
    expect(resolveHandleMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  it('shows an invalid handle instead of an invite, without a lookup', async () => {
    await visit('a-b');
    expect(container.textContent).toContain('Not a valid handle');
    expect(container.querySelector('a[href="/app"]')).toBeNull();
    expect(resolveHandleMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });
});
