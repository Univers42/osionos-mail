// groot#179: Chrome's DevTools Issues panel reports "A form field element should have an id or
// name attribute" for each unnamed field, and osionos frames this app, so each one lands in the
// osionos console, where the subject (III.2) allows no issue. Every JSX form field here carries
// an id or a name.
//
// Caveat: this reads JSX tags, not the rendered DOM. A field named only through a spread
// (`{...props}` is trusted to carry it), a dynamic tag, or one made with document.createElement is
// not checked, so this under-reports: a clean run is necessary, not sufficient.

import { readdirSync, readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const FIELD_TAGS = new Set(['input', 'select', 'textarea']);
const SRC = new URL('./', import.meta.url);

/** `file:line <tag>` for every field tag in `source` with neither an id, a name nor a spread. */
function unnamedFields(file: string, source: string): string[] {
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && FIELD_TAGS.has(node.tagName.getText(sourceFile))) {
      const named = node.attributes.properties.some((attribute) =>
        ts.isJsxSpreadAttribute(attribute) || ['id', 'name'].includes(attribute.name.getText(sourceFile)));
      if (!named) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
        found.push(`${file}:${line} <${node.tagName.getText(sourceFile)}>`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

describe('form field names', () => {
  it('flags an unnamed field and accepts id, name or a spread', () => {
    const source = [
      'const a = <input value={v} />;',
      'const b = <select name="kind" />;',
      'const c = <textarea id="notes"></textarea>;',
      'const d = <input {...props} />;',
    ].join('\n');
    expect(unnamedFields('sample.tsx', source)).toEqual(['sample.tsx:1 <input>']);
  });

  it('gives every form field in the app an id or a name', () => {
    const files = readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter((entry) => entry.endsWith('.tsx'));
    expect(files.length).toBeGreaterThan(3);
    const unnamed = files.flatMap((entry) => unnamedFields(entry, readFileSync(new URL(entry, SRC), 'utf8')));
    expect(unnamed).toEqual([]);
  });
});
