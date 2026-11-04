// Opened top-level, a page with no icon makes the browser ask for /favicon.ico; nginx answers
// 404, and Chrome logs that as a console error (groot#179 follow-up). The page names its own icon.

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('names an icon, so the browser never asks for /favicon.ico', () => {
    expect(html).toMatch(/<link rel="icon" href="[^"]+"/);
  });
});
