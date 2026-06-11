'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createMacroContext(body) {
  const elements = {
    programTitle: { value: '', addEventListener() {} },
    basicSource: { value: '', addEventListener() {} },
    prepareButton: { disabled: false, textContent: '', addEventListener() {} },
    formattedOutput: { textContent: '' },
    status: { textContent: '' },
    lineCount: { textContent: '' },
    lineRange: { textContent: '' },
    commandCount: { textContent: '' }
  };

  const context = {
    console,
    setTimeout,
    clearTimeout,
    Math,
    Number,
    String,
    Array,
    Map,
    Object,
    Date,
    JSON,
    Promise,
    document: {
      getElementById(id) {
        return elements[id];
      }
    },
    globalThis: {}
  };

  context.global = context;
  context.window = context;
  context.globalThis = context.globalThis;
  context.globalThis.__macroBody = body;
  context.globalThis.__macroTitle = 'Bug.bas';

  return { context, elements };
}

async function loadMacroModule(body) {
  const { context, elements } = createMacroContext(body);
  let source = fs.readFileSync('src/frontend/macro.js', 'utf8');
  source = source.replace(
    /^import\s+\{\s*invoke,\s*router,\s*view\s*\}\s+from\s+'@forge\/bridge';\n/m,
    'const invoke = async (name, payload = {}) => {\n' +
      '  const source = String(payload.source || "").replace(/\\r\\n?/g, "\\n").trim();\n' +
      '  const lines = source ? source.split("\\n") : [];\n' +
      '  const numbered = [];\n' +
      '  const commands = new Set();\n' +
      '  for (const line of lines) {\n' +
      '    const match = line.match(/^(\\d+)\\s*(.*)$/);\n' +
      '    if (match) {\n' +
      '      numbered.push(Number(match[1]));\n' +
      '      const command = match[2].trim().split(/\\s+/)[0]?.replace(/[^A-Z]/gi, "").toUpperCase();\n' +
      '      if (command) commands.add(command);\n' +
      '    }\n' +
      '  }\n' +
      '  return {\n' +
      '    normalized: source,\n' +
      '    lineCount: lines.length,\n' +
      '    numberedLineCount: numbered.length,\n' +
      '    firstLine: numbered[0] || null,\n' +
      '    lastLine: numbered.at(-1) || null,\n' +
      '    commands: [...commands].sort(),\n' +
      '    warnings: []\n' +
      '  };\n' +
      '};\nconst router = { navigate: async () => null };\nconst view = { getContext: async () => ({ extension: { text: globalThis.__macroTitle, macro: { body: globalThis.__macroBody } } }) };\n'
  );
  source += '\nglobalThis.__macro = { extractTextFromNode, hydrateFromContext, initialize, parseMacroSeed, localAnalyze };';

  vm.createContext(context);
  vm.runInContext(source, context, { filename: 'macro.js' });

  return { macro: context.globalThis.__macro, elements };
}

test('hydrates program title and source from macro body context', async () => {
  const { macro, elements } = await loadMacroModule('10 PRINT "BUG"\n20 END');

  await macro.initialize();

  assert.equal(elements.programTitle.value, 'Bug.bas');
  assert.equal(elements.basicSource.value, '10 PRINT "BUG"\n20 END');
  assert.match(elements.formattedOutput.textContent, /10 PRINT "BUG"/);
  assert.match(elements.status.textContent, /Ready to prepare/);
});
