import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const jsx = (type: unknown, props: unknown) => ({ type, props });
function compile(text: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const exports: Record<string, any> = {};
  vm.runInNewContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, {
    exports, require(name: string) { if (name in imports) return imports[name]; throw Error(`Unexpected release dependency: ${name}`); }, ...globals,
  });
  return exports;
}

test('public production Notes is closed, local development remains available and no public date is coupled to Notes', () => {
  for (const mode of ['production', 'development', 'test']) {
    const flags = compile(source('src/lib/featureFlags.ts'), { './premium': { ENFORCE_PREMIUM: false } }, { process: { env: { NODE_ENV: mode } } });
    assert.equal(flags.NOTES_ENABLED, process.env.HAVEN_NOTES_RELEASE_VARIANT === 'private' || mode === 'development');
  }
});

test('the direct public route renders Coming soon without initializing the library or adding an opening date', () => {
  for (const enabled of [false, true]) {
    let loaded = 0;
    const page = compile(source('src/app/(app)/notes/page.tsx'), {
      'react/jsx-runtime': { jsx, jsxs: jsx },
      'next/dynamic': () => 'EnabledNotesWorkspace',
      '@/components/ComingSoon': { ComingSoon: 'ComingSoon' },
      '@/lib/featureFlags': { NOTES_ENABLED: enabled },
      '@/i18n': { useT: () => ({ t: (key: string) => ({ nav_notes: 'Notes', comingSoon: 'Coming soon' })[key as 'nav_notes'] }), usePageTitle() {} },
      '@/components/notes/NotesWorkspace': { get NotesWorkspace() { loaded++; throw Error('public library initialization'); } },
    });
    const result = page.default();
    assert.equal(result.type, enabled ? 'EnabledNotesWorkspace' : 'ComingSoon');
    if (!enabled) assert.deepEqual({ ...result.props }, { title: 'Notes', tag: 'Coming soon' });
    assert.equal(loaded, 0);
  }
});

test('Notes overlay exclusions apply only to enabled Notes, never the public locked screen', () => {
  for (const enabled of [false, true]) for (const pathname of ['/notes/', '/notes/page', '/dashboard/']) {
    const boundary = compile(source('src/components/notes/NotesRouteBoundary.tsx'), {
      'next/navigation': { usePathname: () => pathname }, '@/lib/featureFlags': { NOTES_ENABLED: enabled },
    });
    assert.equal(boundary.OutsideNotes({ children: 'normal global UI' }), enabled && pathname.startsWith('/notes') ? null : 'normal global UI');
  }
});

test('locked Notes navigation has no active link and shows Coming soon in expanded and collapsed sidebars', () => {
  const text = source('src/components/Sidebar.tsx'), ast = ts.createSourceFile('Sidebar.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const row = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'NavRow'); assert.ok(row);
  const component = compile(row.getText(ast) + '\nexports.NavRow = NavRow;', { 'react/jsx-runtime': { jsx, jsxs: jsx } }, {
    useT: () => ({ t: (key: string) => key === 'comingSoon' ? 'Coming soon' : 'Notes' }), Lock: 'Lock', Tooltip: 'Tooltip', InteractionLink: 'Link',
  });
  for (const collapsed of [false, true]) {
    const result = component.NavRow({ item: { href: '/notes', labelKey: 'nav_notes', icon: 'Book', locked: true }, active: false, collapsed });
    assert.equal(result.type, 'div'); assert.equal(result.props.href, undefined);
    assert.ok(JSON.stringify(result).includes('Coming soon'));
  }
});

test('public Notes preferences cannot write even if an old UI action is invoked', () => {
  const text = source('src/app/(app)/settings/page.tsx'), ast = ts.createSourceFile('settings.tsx', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let action: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'updateNewNotebookDirection') action = node; ts.forEachChild(node, visit); };
  visit(ast); assert.ok(action);
  for (const enabled of [false, true]) {
    let writes = 0;
    const exported = compile(`const ${action.getText(ast)}; exports.update = updateNewNotebookDirection;`, {}, {
      NOTES_ENABLED: enabled, accountId: 'isolated-fixture', saveNotesPreferences() { writes++; return true; }, setNewNotebookDirection() {},
    });
    exported.update('horizontal'); assert.equal(writes, enabled ? 1 : 0);
  }
});
