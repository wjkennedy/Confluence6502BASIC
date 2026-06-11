'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function createRunnerContext() {
  const screen = {
    textContent: '',
    scrollTop: 0,
    scrollHeight: 0,
    focus() {},
    addEventListener() {}
  };

  const elements = {
    screen,
    paletteSelect: { value: 'c64', addEventListener() {} },
    fontSizeRange: { value: '15', addEventListener() {} },
    fontSizeValue: { textContent: '' },
    pageSpaceKey: { value: '', addEventListener() {} },
    createGamesPage: { disabled: false, textContent: '', addEventListener() {} },
    createGamesPageStatus: { textContent: '' },
    runDemo: { addEventListener() {} },
    resetRuntime: { addEventListener() {} },
    loadPrepared: { addEventListener() {} },
    loadedProgram: { textContent: '' }
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
      body: { dataset: {} },
      documentElement: { style: { setProperty() {} } },
      getElementById(id) {
        return elements[id];
      }
    },
    localStorage: {
      getItem() {
        return null;
      },
      setItem() {}
    },
    globalThis: {}
  };

  context.global = context;
  context.window = context;
  context.globalThis = context.globalThis;

  return { context, screen, elements };
}

async function loadRunnerModule() {
  const { context, screen, elements } = createRunnerContext();
  let source = fs.readFileSync('src/frontend/runner.js', 'utf8');
  source = source.replace(
    /^import\s+\{\s*BASIC_FIRST_GAME_SOURCE,\s*BASIC_FIRST_GAME_TITLE\s*\}\s+from\s+'\.\.\/games-page-data\.js';\n/m,
    'const BASIC_FIRST_GAME_SOURCE = globalThis.__gamesPageSource;\nconst BASIC_FIRST_GAME_TITLE = globalThis.__gamesPageTitle;\n'
  );
  source = source.replace(
    /^import\s+\{\s*invoke,\s*requestConfluence\s*\}\s+from\s+'@forge\/bridge';\n/m,
    'const invoke = async () => null;\nconst requestConfluence = (...args) => globalThis.__requestConfluence(...args);\n'
  );
  source += '\nglobalThis.__runner = { boot, createGamesPage, executeImmediate, loadProgramSource, runtime, submitCommand };';

  vm.createContext(context);
  context.globalThis.__requestConfluence = async () => null;
  context.globalThis.__gamesPageSource = [
    '5 PRINT',
    '10 PRINT "SOLITAIRE CHECKER PUZZLE BY DAVID AHL"',
    '15 PRINT',
    '20 PRINT "48 CHECKERS ARE PLACED ON THE 2 OUTSIDE SPACES OF A"',
    '25 PRINT "STANDARD 64-SQUARE CHECKERBOARD.  THE OBJECT IS TO"',
    '30 PRINT "REMOVE AS MANY CHECKERS AS POSSIBLE BY DIAGONAL JUMPS"',
    '35 PRINT "(AS IN STANDARD CHECKERS).  USE THE NUMBERED BOARD TO"',
    '40 PRINT "INDICATE THE SQUARE YOU WISH TO JUMP FROM AND TO.  ON"',
    '45 PRINT "THE BOARD PRINTED OUT ON EACH TURN \'1\' INDICATES A"',
    '50 PRINT "CHECKER AND \'0\' AN EMPTY SQUARE.  WHEN YOU HAVE NO"',
    '55 PRINT "POSSIBLE JUMPS REMAINING, INPUT A \'0\' IN RESPONSE TO"',
    '60 PRINT "QUESTION \'JUMP FROM ?\'"',
    '62 PRINT',
    '65 PRINT "HERE IS THE NUMERICAL BOARD:"',
    '66 PRINT',
    '68 DIM A(64)',
    '70 FOR J=1 TO 57 STEP 8',
    '72 B$="## ##  ##  ##  ##  ##  ##  ##"',
    '74 PRINT USING B$;J,J+1,J+2,J+3,J+4,J+5,J+6,J+7',
    '76 NEXT J',
    '77 PRINT',
    '78 PRINT "AND HERE IS THE OPENING POSITION OF THE CHECKERS:"',
    '79 PRINT',
    '80 FOR J=1 TO 64',
    '82 A(J)=1',
    '84 NEXT J',
    '86 FOR J=19 TO 43 STEP 8',
    '88 FOR I=J TO J+3',
    '90 A(I)=0',
    '92 NEXT I',
    '94 NEXT J',
    '96 M=0',
    '98 GOTO 340',
    '100 INPUT "JUMP FROM";F',
    '105 IF F=0 THEN 500',
    '110 INPUT "TO";T',
    '112 PRINT',
    '118 REM *** CHECK LEGALITY OF MOVE',
    '120 F1=INT((F-1)/8)',
    '130 F2=F-8*F1',
    '140 T1=INT((T-1)/8)',
    '150 T2=T-8*T1',
    '160 IF F1>7 THEN 230',
    '170 IF T1>7 THEN 230',
    '180 IF F2>8 THEN 230',
    '190 IF T2>8 THEN 230',
    '200 IF ABS(F1-T1)<>2 THEN 230',
    '210 IF ABS(F2-T2)<>2 THEN 230',
    '212 IF A((T+F)/2)=0 THEN 230',
    '215 IF A(F)=0 THEN 230',
    '220 IF A(T)=1 THEN 230',
    '225 GOTO 250',
    '230 PRINT "ILLEGAL MOVE.  TRY AGAIN..."',
    '240 GOTO 100',
    '245 REM *** UPDATE BOARD',
    '250 A(T)=1',
    '260 A(F)=0',
    '270 A((T+F)/2)=0',
    '290 M=M+1',
    '310 REM *** PRINT BOARD',
    '340 FOR J=1 TO 57 STEP 8',
    '350 FOR I=J TO J+7',
    '360 PRINT A(I);',
    '370 NEXT I',
    '380 PRINT',
    '390 NEXT J',
    '400 PRINT',
    '410 GOTO 100',
    '490 REM *** END GAME SUMMARY',
    '500 S=0',
    '510 FOR I=1 TO 64',
    '520 S=S+A(I)',
    '530 NEXT I',
    '535 PRINT',
    '540 PRINT "YOU MADE"M"JUMPS AND HAD"S"PIECES"',
    '550 PRINT "REMAINING ON THE BOARD."',
    '560 PRINT',
    '562 INPUT "TRY AGAIN";A$',
    '570 IF A$="YES" THEN 70',
    '575 IF A$="NO" THEN 600',
    '580 PRINT "PLEASE ANSWER \'YES\' OR \'NO\'."',
    '590 GOTO 562',
    '600 PRINT',
    '610 PRINT "O.K.  HOPE YOU HAD FUN!"',
    '999 END'
  ].join('\n');
  context.globalThis.__gamesPageTitle = '1CHECK';
  vm.runInContext(source, context, { filename: 'runner.js' });

  return { runner: context.globalThis.__runner, screen, elements, context };
}

test('runs a prepared BASIC loop with a scalar loop variable', async () => {
  const { runner, screen } = await loadRunnerModule();
  screen.textContent = '';

  runner.loadProgramSource([
    '10 PRINT "HELLO"',
    '20 FOR I = 1 TO 5',
    '30 PRINT I, I * I',
    '40 NEXT I',
    '50 END'
  ].join('\n'));

  await runner.executeImmediate('RUN');

  assert.match(screen.textContent, /HELLO/);
  assert.match(screen.textContent, /1\s+1/);
  assert.match(screen.textContent, /2\s+4/);
  assert.match(screen.textContent, /3\s+9/);
  assert.match(screen.textContent, /4\s+16/);
  assert.match(screen.textContent, /5\s+25/);
  assert.doesNotMatch(screen.textContent, /SYNTAX ERROR/);
});

test('handles ELIZA-style DATA, READ, arrays, and string functions', async () => {
  const { runner, screen } = await loadRunnerModule();
  screen.textContent = '';

  runner.loadProgramSource([
    '10 DIM A(2)',
    '20 DATA 3,4',
    '30 READ A(1),A(2)',
    '40 PRINT A(1)+A(2)',
    '50 PRINT LEFT$("ABCDE",2)+RIGHT$("VWXYZ",2)',
    '60 PRINT MID$("ABCDE",2,3)',
    '70 IF MID$("ABCDE",2,3)="BCD"THEN PRINT "OK"',
    '80 END'
  ].join('\n'));

  await runner.executeImmediate('RUN');

  assert.match(screen.textContent, /7/);
  assert.match(screen.textContent, /ABYZ/);
  assert.match(screen.textContent, /BCD/);
  assert.match(screen.textContent, /OK/);
  assert.doesNotMatch(screen.textContent, /SYNTAX ERROR/);
});

test('keeps IF THEN colon chains together', async () => {
  const { runner, screen } = await loadRunnerModule();
  screen.textContent = '';

  runner.loadProgramSource([
    '10 IF 1 THEN PRINT "A":GOTO 30',
    '20 PRINT "B"',
    '30 PRINT "C"',
    '40 END'
  ].join('\n'));

  await runner.executeImmediate('RUN');

  assert.match(screen.textContent, /A/);
  assert.doesNotMatch(screen.textContent, /B/);
  assert.match(screen.textContent, /C/);
  assert.doesNotMatch(screen.textContent, /SYNTAX ERROR/);
});

test('splits BASIC statement chains on backslash separators', async () => {
  const { runner, screen } = await loadRunnerModule();
  screen.textContent = '';

  runner.loadProgramSource([
    '10 PRINT "A"\\PRINT "B"\\GOTO 40',
    '20 PRINT "SHOULD NOT APPEAR"',
    '40 PRINT "C"',
    '50 END'
  ].join('\n'));

  await runner.executeImmediate('RUN');

  assert.match(screen.textContent, /A/);
  assert.match(screen.textContent, /B/);
  assert.match(screen.textContent, /C/);
  assert.doesNotMatch(screen.textContent, /SHOULD NOT APPEAR/);
  assert.doesNotMatch(screen.textContent, /SYNTAX ERROR/);
});

test('reset cancels a running loop before loop limit', async () => {
  const { runner, screen } = await loadRunnerModule();
  screen.textContent = '';

  runner.loadProgramSource([
    '10 PRINT "HELLO"',
    '20 GOTO 10'
  ].join('\n'));

  const run = runner.executeImmediate('RUN');
  queueMicrotask(() => runner.boot());
  await run;

  assert.doesNotMatch(screen.textContent, /LOOP LIMIT EXCEEDED/);
  assert.match(screen.textContent, /MICROSOFT BASIC 6502 VERSION 1\.1/);
  assert.match(screen.textContent, /READY\./);
});

test('keeps keyboard input enabled while waiting for INPUT', async () => {
  const { runner, screen } = await loadRunnerModule();
  screen.textContent = '';

  runner.loadProgramSource([
    '10 INPUT A$',
    '20 PRINT A$',
    '30 END'
  ].join('\n'));

  await runner.executeImmediate('RUN');

  assert.equal(runner.runtime.inputEnabled, true);
  assert.equal(runner.runtime.awaitingInput != null, true);
  assert.match(screen.textContent, /\?\s*$/);
});

test('supports BASIC IF THEN ELSE with logical OR and AND', async () => {
  const { runner, screen } = await loadRunnerModule();
  screen.textContent = '';

  runner.loadProgramSource([
    '10 K=1',
    '20 X=3',
    '30 IF K<>1 OR X<>3 THEN PRINT "BAD" ELSE PRINT "GOOD"',
    '40 IF NOT(K=1 AND X=3) THEN PRINT "FAIL" ELSE PRINT "OK"',
    '50 IF K=3 THEN 80 ELSE GOTO 60',
    '60 PRINT "FALLTHROUGH"',
    '70 END',
    '80 PRINT "JUMPED"',
    '90 END'
  ].join('\n'));

  await runner.executeImmediate('RUN');

  assert.match(screen.textContent, /GOOD/);
  assert.match(screen.textContent, /OK/);
  assert.match(screen.textContent, /FALLTHROUGH/);
  assert.doesNotMatch(screen.textContent, /BAD/);
  assert.doesNotMatch(screen.textContent, /FAIL/);
  assert.doesNotMatch(screen.textContent, /JUMPED/);
  assert.doesNotMatch(screen.textContent, /SYNTAX ERROR/);
});

test('creates a Confluence page from the generated games stub body', async () => {
  const { runner, elements, context } = await loadRunnerModule();
  const calls = [];
  context.globalThis.__requestConfluence = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.startsWith('/wiki/api/v2/spaces?keys=')) {
      return {
        ok: true,
        json: async () => ({ results: [{ id: 'space-123' }] })
      };
    }

    if (url === '/wiki/api/v2/pages') {
      return {
        ok: true,
        json: async () => ({ _links: { base: 'https://example.atlassian.net', webui: '/wiki/spaces/SPACE/pages/123' } })
      };
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  elements.pageSpaceKey.value = 'SPACE';
  await runner.createGamesPage();

  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /\/wiki\/api\/v2\/spaces\?keys=SPACE$/);
  assert.equal(calls[1].url, '/wiki/api/v2/pages');

  const pagePayload = JSON.parse(calls[1].options.body);
  assert.equal(pagePayload.spaceId, 'space-123');
  assert.equal(pagePayload.title, '1CHECK');
  assert.equal(pagePayload.body.representation, 'atlas_doc_format');
  const adf = JSON.parse(pagePayload.body.value);
  assert.equal(adf.type, 'doc');
  assert.equal(adf.content[0].type, 'heading');
  assert.equal(adf.content[0].content[0].text, '1CHECK');
  assert.equal(adf.content[2].type, 'heading');
  assert.equal(adf.content[2].content[0].text, 'Mini manual');
  assert.equal(adf.content[4].type, 'paragraph');
  assert.equal(adf.content[4].content[0].text, '1CHECK macro');
  assert.equal(adf.content[5].type, 'bodiedExtension');
  assert.equal(adf.content[5].attrs.extensionKey, '56be77c8-a94a-4580-a686-76856c812c75/65a2485d-b216-421d-a172-a6abefca842e/static/basic-m6502-macro');
  assert.equal(adf.content[5].attrs.text, '1CHECK');
  assert.equal(adf.content[5].content[0].type, 'heading');
  assert.equal(adf.content[5].content[0].content[0].text, '1CHECK');
  assert.equal(adf.content[5].content[1].type, 'codeBlock');
  assert.match(adf.content[5].content[1].content[0].text, /^5 PRINT/m);
  assert.match(elements.createGamesPageStatus.textContent, /Created 1CHECK in SPACE/);
});

test('generates a single-entry Confluence page with source inside the macro body', () => {
  const page = fs.readFileSync('confluence/first-basic-computer-game.storage.xml', 'utf8');

  assert.match(page, /<h1>101 BASIC Computer Games - First Entry<\/h1>/);
  assert.match(page, /<ac:adf-attribute key="text">1CHECK<\/ac:adf-attribute>/);
  assert.match(page, /<ac:plain-text-body><!\[CDATA\[\n5 PRINT/);
  assert.doesNotMatch(page, /TITLE:\s/);
  assert.doesNotMatch(page, /SOURCE:\s/);
});
