// The manifest ships no DOM library, so this renders the real component on the server and runs
// its effects by hand against an EventTarget standing in for `document`.
//
// Caveat: this proves the listener and the markup, not focus or layout. A stubbed document has no
// focus, so a bug that only shows in a browser, such as another handler stopping propagation of
// the key before it reaches `document`, passes here.

import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ComposerModal } from './ComposerModal';

const effectCleanups = vi.hoisted(() => [] as Array<() => void>);

vi.mock('react', async (importOriginal) => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useEffect: (effect: () => void | (() => void)) => {
      const cleanup = effect();
      if (cleanup) effectCleanups.push(cleanup);
    },
  };
});

const fakeDocument = new EventTarget();

function press(key: string, isComposing = false) {
  fakeDocument.dispatchEvent(Object.assign(new Event('keydown'), { key, isComposing }));
}

function renderComposer() {
  const onClose = vi.fn();
  const onCreateDraft = vi.fn();
  const markup = renderToStaticMarkup(<ComposerModal onClose={onClose} onCreateDraft={onCreateDraft} />);
  return { markup, onClose, onCreateDraft };
}

describe('ComposerModal', () => {
  beforeEach(() => {
    vi.stubGlobal('document', fakeDocument);
  });

  afterEach(() => {
    effectCleanups.splice(0).forEach((cleanup) => cleanup());
    vi.unstubAllGlobals();
  });

  it('closes on Escape the way the X does: onClose alone, no draft saved', () => {
    const { onClose, onCreateDraft } = renderComposer();
    press('Escape');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onCreateDraft).not.toHaveBeenCalled();
  });

  it('stays open for any other key', () => {
    const { onClose } = renderComposer();
    press('Enter');
    press('a');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('leaves Escape to the input method while a composition is active', () => {
    const { onClose } = renderComposer();
    press('Escape', true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('stops listening once unmounted', () => {
    const { onClose } = renderComposer();
    effectCleanups.splice(0).forEach((cleanup) => cleanup());
    press('Escape');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('is exposed as a named modal dialog', () => {
    const { markup } = renderComposer();
    expect(markup).toContain('role="dialog"');
    expect(markup).toContain('aria-modal="true"');
    expect(markup).toContain('aria-label="Compose mail"');
  });
});
