'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MACRO_MODULE_KEY,
  RUNNER_MODULE_KEY,
  analyzeBasicProgram,
  getLatestPreparedProgram,
  getRuntimeMetadata,
  getPreparedProgram,
  prepareProgram,
  requireConfluenceMacroContext,
  requireConfluenceRunnerContext,
  setStorageForTests
} = require('../src/index');

const macroContext = { accountId: 'user-1', extension: { moduleKey: MACRO_MODULE_KEY } };
const runnerContext = { accountId: 'user-1', extension: { moduleKey: RUNNER_MODULE_KEY } };

function createMemoryStorage() {
  const entries = new Map();
  return {
    entries,
    async get(key) {
      return entries.get(key);
    },
    async set(key, value) {
      entries.set(key, value);
    }
  };
}

test('returns immutable runtime metadata for the macro', () => {
  const metadata = getRuntimeMetadata();

  assert.equal(metadata.name, 'Microsoft BASIC for 6502 Microprocessor');
  assert.deepEqual(metadata.supportedSurfaces, ['confluence:macro', 'confluence:globalPage']);
  assert.ok(Object.isFrozen(metadata));
});

test('allows calls from the configured macro module', () => {
  assert.doesNotThrow(() => requireConfluenceMacroContext(macroContext));
});

test('rejects calls outside the configured macro module', () => {
  assert.throws(
    () => requireConfluenceMacroContext(runnerContext),
    /only available/
  );
});

test('rejects missing Forge context', () => {
  assert.throws(() => requireConfluenceMacroContext(), /only available/);
});

test('allows calls from the configured runner module', () => {
  assert.doesNotThrow(() => requireConfluenceRunnerContext(runnerContext));
});

test('allows runner calls from Confluence global page context type', () => {
  assert.doesNotThrow(() => requireConfluenceRunnerContext({
    accountId: 'user-1',
    extension: { type: 'confluence:globalPage' }
  }));
});

test('analyzes line-numbered BASIC source for macro formatting', () => {
  const analysis = analyzeBasicProgram('10 PRINT "HI"\n20 GOTO 10\n');

  assert.equal(analysis.lineCount, 2);
  assert.equal(analysis.numberedLineCount, 2);
  assert.equal(analysis.firstLine, 10);
  assert.equal(analysis.lastLine, 20);
  assert.deepEqual(analysis.commands, ['GOTO', 'PRINT']);
  assert.deepEqual(analysis.warnings, []);
});

test('warns when source contains unnumbered lines', () => {
  const analysis = analyzeBasicProgram('PRINT "HI"');

  assert.equal(analysis.lineCount, 1);
  assert.equal(analysis.numberedLineCount, 0);
  assert.match(analysis.warnings[0], /no BASIC line number/);
});

test('decodes HTML-encoded prepared source before analysis', () => {
  const analysis = analyzeBasicProgram('10 PRINT &amp;amp;quot;HI&amp;amp;quot;');

  assert.equal(analysis.normalized, '10 PRINT "HI"');
  assert.equal(analysis.commands[0], 'PRINT');
});

test('accepts numeric literals in BASIC expressions', () => {
  const analysis = analyzeBasicProgram('10 FOR I = 1 TO 5');

  assert.equal(analysis.numberedLineCount, 1);
  assert.equal(analysis.commands[0], 'FOR');
});

test('prepares a macro program and lets the runner load the latest prepared program', async () => {
  const memoryStorage = createMemoryStorage();
  setStorageForTests(memoryStorage);

  const prepared = await prepareProgram({
    title: 'Squares',
    source: '10 PRINT "SQUARES"\n20 END'
  }, macroContext);

  assert.equal(prepared.title, 'Squares');
  assert.equal(prepared.analysis.lineCount, 2);

  const latest = await getLatestPreparedProgram({}, runnerContext);
  assert.equal(latest.id, prepared.programId);
  assert.equal(latest.source, '10 PRINT "SQUARES"\n20 END');

  const latestFromGlobalPageContext = await getLatestPreparedProgram({}, {
    accountId: 'user-1',
    extension: { type: 'confluence:globalPage' }
  });
  assert.equal(latestFromGlobalPageContext.id, prepared.programId);

  const byId = await getPreparedProgram({ programId: prepared.programId }, runnerContext);
  assert.equal(byId.title, 'Squares');
});

test('rejects program preparation from the runner module', async () => {
  const memoryStorage = createMemoryStorage();
  setStorageForTests(memoryStorage);

  await assert.rejects(
    () => prepareProgram({ source: '10 END' }, runnerContext),
    /only available/
  );
});

test('prevents a different user from loading another user prepared program', async () => {
  const memoryStorage = createMemoryStorage();
  setStorageForTests(memoryStorage);

  const prepared = await prepareProgram({ source: '10 END' }, macroContext);

  await assert.rejects(
    () => getPreparedProgram({
      programId: prepared.programId
    }, { accountId: 'user-2', extension: { moduleKey: RUNNER_MODULE_KEY } }),
    /not available/
  );
});

test('backfills analysis for older stored prepared programs', async () => {
  const memoryStorage = createMemoryStorage();
  setStorageForTests(memoryStorage);
  memoryStorage.entries.set('prepared-program:legacy-1', {
    id: 'legacy-1',
    title: 'Legacy',
    source: '10 PRINT "OLD"\n20 END',
    ownerAccountId: 'user-1'
  });

  const program = await getPreparedProgram({ programId: 'legacy-1' }, runnerContext);

  assert.equal(program.analysis.lineCount, 2);
  assert.deepEqual(program.analysis.commands, ['END', 'PRINT']);
});
