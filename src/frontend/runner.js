import { invoke, requestConfluence } from '@forge/bridge';
import {
  BASIC_FIRST_GAME_SOURCE,
  BASIC_FIRST_GAME_TITLE
} from '../games-page-data.js';

const screenElement = document.getElementById('screen');
const paletteSelect = document.getElementById('paletteSelect');
const fontSizeRange = document.getElementById('fontSizeRange');
const fontSizeValue = document.getElementById('fontSizeValue');
const pageSpaceKeyInput = document.getElementById('pageSpaceKey');
const createGamesPageButton = document.getElementById('createGamesPage');
const createGamesPageStatus = document.getElementById('createGamesPageStatus');
const runDemoButton = document.getElementById('runDemo');
const resetButton = document.getElementById('resetRuntime');
const loadPreparedButton = document.getElementById('loadPrepared');
const loadedProgramElement = document.getElementById('loadedProgram');

const PREFERENCE_KEYS = {
  palette: 'basic-m6502.palette',
  fontSize: 'basic-m6502.fontSize'
};

const runtime = {
  program: new Map(),
  variables: new Map(),
  arrays: new Map(),
  awaitingInput: null,
  execution: null,
  history: [],
  inputLine: '',
  inputEnabled: true,
  promptActive: false,
  currentLine: '',
  data: [],
  dataPointer: 0,
  runToken: 0
};

function printLine(value = '') {
  screenElement.textContent += `${value}\n`;
  runtime.currentLine = '';
  screenElement.scrollTop = screenElement.scrollHeight;
}

function print(value = '') {
  screenElement.textContent += value;
  runtime.currentLine += value;
  screenElement.scrollTop = screenElement.scrollHeight;
}

function setPageCreationStatus(message) {
  if (createGamesPageStatus) {
    createGamesPageStatus.textContent = message;
  }
}

function nextFrame() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function setInputEnabled(enabled) {
  runtime.inputEnabled = enabled;
}

function loadPreference(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value == null ? fallback : value;
  } catch (error) {
    return fallback;
  }
}

function savePreference(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // Ignore storage failures in embedded contexts.
  }
}

function setPalette(palette, persist = true) {
  const nextPalette = ['c64', 'bw', 'atari'].includes(palette) ? palette : 'c64';
  document.body.dataset.palette = nextPalette;
  paletteSelect.value = nextPalette;
  if (persist) {
    savePreference(PREFERENCE_KEYS.palette, nextPalette);
  }
}

function setFontSize(fontSize, persist = true) {
  const nextSize = Math.min(24, Math.max(12, Number(fontSize) || 15));
  document.documentElement.style.setProperty('--terminal-font-size', `${nextSize}px`);
  fontSizeRange.value = String(nextSize);
  fontSizeValue.textContent = `${nextSize}px`;
  if (persist) {
    savePreference(PREFERENCE_KEYS.fontSize, String(nextSize));
  }
}

function applySavedPreferences() {
  setPalette(loadPreference(PREFERENCE_KEYS.palette, 'c64'), false);
  setFontSize(loadPreference(PREFERENCE_KEYS.fontSize, '15'), false);
}

function printPrompt() {
  runtime.promptActive = true;
  runtime.inputLine = '';
  print('] ');
}

function clearActivePrompt() {
  if (!runtime.promptActive || runtime.inputLine.length > 0) {
    return;
  }
  if (runtime.currentLine === '] ' && screenElement.textContent.endsWith('] ')) {
    screenElement.textContent = screenElement.textContent.slice(0, -2);
    runtime.currentLine = '';
  }
  runtime.promptActive = false;
}

function beginSystemOutput() {
  clearActivePrompt();
  if (screenElement.textContent && !screenElement.textContent.endsWith('\n')) {
    printLine();
  }
}

function boot() {
  runtime.runToken += 1;
  screenElement.textContent = '';
  runtime.variables.clear();
  runtime.arrays.clear();
  runtime.awaitingInput = null;
  runtime.execution = null;
  runtime.inputLine = '';
  runtime.promptActive = false;
  runtime.currentLine = '';
  runtime.dataPointer = 0;
  setInputEnabled(true);
  printLine('MICROSOFT BASIC 6502 VERSION 1.1');
  printLine('COPYRIGHT 1976-1978 MICRO-SOFT');
  printLine('CONFLUENCE APP RUNNER COMPATIBILITY RUNTIME');
  printLine('READY.');
  printPrompt();
  screenElement.focus();
}

function normalizeLine(command) {
  return command.trim().replace(/\s+/g, ' ');
}

function storeProgramLine(command) {
  const match = command.match(/^(\d+)\s*(.*)$/);
  if (!match) {
    return false;
  }

  const lineNumber = Number(match[1]);
  const statement = match[2].trim();
  if (statement) {
    runtime.program.set(lineNumber, statement);
  } else {
    runtime.program.delete(lineNumber);
  }
  refreshDataPool();
  return true;
}

function loadProgramSource(source) {
  runtime.program.clear();
  String(source || '').split('\n').forEach((line) => {
    const normalized = normalizeLine(decodeHtmlEntities(line));
    if (normalized) {
      storeProgramLine(normalized);
    }
  });
  refreshDataPool();
}

function decodeHtmlEntities(value) {
  const entities = {
    amp: '&',
    apos: "'",
    gt: '>',
    lt: '<',
    quot: '"',
    nbsp: ' '
  };

  let output = String(value ?? '');
  for (let pass = 0; pass < 4; pass += 1) {
    const next = output.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
      const lower = entity.toLowerCase();
      if (lower.startsWith('#x')) {
        const codePoint = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      if (lower.startsWith('#')) {
        const codePoint = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return Object.prototype.hasOwnProperty.call(entities, lower) ? entities[lower] : match;
    });

    if (next === output) {
      break;
    }
    output = next;
  }

  return output;
}

function getProgramLineCount(program) {
  if (Number.isFinite(program?.analysis?.lineCount)) {
    return program.analysis.lineCount;
  }
  const source = String(program?.source || '').trim();
  return source ? source.split('\n').length : 0;
}

function splitListItems(text) {
  const items = [];
  let current = '';
  let inString = false;
  let depth = 0;

  for (const char of String(text || '')) {
    if (char === '"') {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString) {
      if (char === '(') {
        depth += 1;
      } else if (char === ')' && depth > 0) {
        depth -= 1;
      } else if (char === ',' && depth === 0) {
        if (current.trim()) {
          items.push(current.trim());
        }
        current = '';
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) {
    items.push(current.trim());
  }

  return items;
}

function splitAssignment(statement) {
  let inString = false;
  let depth = 0;

  for (let index = 0; index < statement.length; index += 1) {
    const char = statement[index];

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '(') {
      depth += 1;
    } else if (char === ')' && depth > 0) {
      depth -= 1;
    } else if (char === '=' && depth === 0) {
      return {
        left: statement.slice(0, index).trim(),
        right: statement.slice(index + 1).trim()
      };
    }
  }

  return null;
}

function isAssignableTarget(target) {
  if (/^[A-Z][A-Z0-9]?\$?$/i.test(target)) {
    return true;
  }
  return parseArrayReference(target) != null;
}

function parseArrayReference(text) {
  const match = String(text || '').trim().match(/^([A-Z][A-Z0-9]?\$?)\s*\(\s*(.+)\s*\)$/i);
  if (!match) {
    return null;
  }
  return {
    name: match[1].toUpperCase(),
    indexExpression: match[2]
  };
}

function ensureArray(name, isString = false, size = 0) {
  const key = String(name || '').toUpperCase();
  const current = runtime.arrays.get(key);
  if (current) {
    if (size > current.values.length - 1) {
      const fill = current.isString ? '' : 0;
      while (current.values.length <= size) {
        current.values.push(fill);
      }
    }
    return current;
  }

  const fill = isString ? '' : 0;
  const values = Array.from({ length: Math.max(0, size) + 1 }, () => fill);
  const entry = { isString, values };
  runtime.arrays.set(key, entry);
  return entry;
}

function refreshDataPool() {
  runtime.data = [];
  runtime.dataPointer = 0;

  const lines = [...runtime.program.entries()].sort((a, b) => a[0] - b[0]);
  for (const [, statement] of lines) {
    for (const part of splitStatements(statement)) {
      if (!/^DATA\b/i.test(part)) {
        continue;
      }
      const payload = part.replace(/^DATA\s*/i, '');
      for (const item of splitListItems(payload)) {
        runtime.data.push(evaluate(item));
      }
    }
  }
}

function readDataValue() {
  if (runtime.dataPointer >= runtime.data.length) {
    throw new Error('?OUT OF DATA ERROR');
  }
  const value = runtime.data[runtime.dataPointer];
  runtime.dataPointer += 1;
  return value;
}

function assignTarget(target, value) {
  const arrayReference = parseArrayReference(target);
  if (arrayReference) {
    const index = Number(evaluate(arrayReference.indexExpression));
    const array = ensureArray(arrayReference.name, arrayReference.name.endsWith('$'), index);
    array.values[index] = arrayReference.name.endsWith('$') ? String(value) : Number(value);
    return;
  }

  const name = String(target || '').trim().toUpperCase();
  if (!/^([A-Z][A-Z0-9]?\$?)$/.test(name)) {
    throw new Error('SYNTAX ERROR');
  }
  setVar(name, name.endsWith('$') ? String(value) : Number(value));
}

function listProgram() {
  [...runtime.program.entries()]
    .sort((a, b) => a[0] - b[0])
    .forEach(([lineNumber, statement]) => printLine(`${lineNumber} ${statement}`));
}

function splitArguments(text) {
  const args = [];
  let current = '';
  let inString = false;

  for (const char of text) {
    if (char === '"') {
      inString = !inString;
      current += char;
    } else if ((char === ',' || char === ';') && !inString) {
      args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim() || text.endsWith(',') || text.endsWith(';')) {
    args.push(current.trim());
  }

  return args;
}

function splitStatements(text) {
  const statements = [];
  let current = '';
  let inString = false;
  let depth = 0;
  let inIfTail = false;

  for (const char of text) {
    if (char === '"') {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString) {
      if (char === '(') {
        depth += 1;
      } else if (char === ')' && depth > 0) {
        depth -= 1;
      } else if ((char === ':' || char === '\\') && depth === 0 && !inIfTail) {
        if (current.trim()) {
          statements.push(current.trim());
        }
        current = '';
        inIfTail = false;
        continue;
      }
    }

    current += char;

    if (!inIfTail) {
      const trimmed = current.trimStart().toUpperCase();
      if (trimmed.startsWith('IF') && /\bTHEN\b/.test(trimmed)) {
        inIfTail = true;
      }
    }
  }

  if (current.trim()) {
    statements.push(current.trim());
  }

  return statements;
}

function findTopLevelKeyword(text, keyword, startIndex = 0) {
  const source = String(text || '');
  const target = keyword.toUpperCase();
  let inString = false;
  let depth = 0;

  for (let index = startIndex; index <= source.length - target.length; index += 1) {
    const char = source[index];

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')' && depth > 0) {
      depth -= 1;
      continue;
    }

    if (depth !== 0) {
      continue;
    }

    if (source.slice(index, index + target.length).toUpperCase() !== target) {
      continue;
    }

    const before = source[index - 1];
    const after = source[index + target.length];
    const beforeOk = index === 0 || !/[A-Z0-9$]/i.test(before || '');
    const afterOk = index + target.length === source.length || !/[A-Z0-9$]/i.test(after || '');
    if (beforeOk && afterOk) {
      return index;
    }
  }

  return -1;
}

function splitIfStatement(statement) {
  const source = String(statement || '').trim();
  if (!/^IF\b/i.test(source)) {
    return null;
  }

  const body = source.replace(/^IF\b/i, '').trimStart();
  const thenIndex = findTopLevelKeyword(body, 'THEN');
  if (thenIndex < 0) {
    throw new Error('SYNTAX ERROR');
  }

  const condition = body.slice(0, thenIndex).trim();
  const afterThen = body.slice(thenIndex + 4).trimStart();
  const elseIndex = findTopLevelKeyword(afterThen, 'ELSE');

  return {
    condition,
    thenBody: (elseIndex < 0 ? afterThen : afterThen.slice(0, elseIndex)).trim(),
    elseBody: elseIndex < 0 ? '' : afterThen.slice(elseIndex + 4).trim()
  };
}

function parsePrintItems(text) {
  const items = [];
  let current = '';
  let inString = false;
  let depth = 0;

  for (const char of text) {
    if (char === '"') {
      inString = !inString;
      current += char;
      continue;
    }

    if (!inString) {
      if (char === '(') {
        depth += 1;
      } else if (char === ')' && depth > 0) {
        depth -= 1;
      } else if ((char === ',' || char === ';') && depth === 0) {
        items.push({ expression: current.trim(), separator: char });
        current = '';
        continue;
      }
    }

    current += char;
  }

  items.push({ expression: current.trim(), separator: null });
  return items;
}

function currentColumn() {
  return runtime.currentLine.length + 1;
}

function tabToColumn(targetColumn) {
  const nextColumn = Math.max(1, Number(targetColumn) || 1);
  const spacesNeeded = Math.max(0, nextColumn - currentColumn());
  if (spacesNeeded > 0) {
    print(' '.repeat(spacesNeeded));
  }
}

function tokenizeExpression(expression) {
  const tokens = [];
  const text = String(expression || '');
  let index = 0;

  while (index < text.length) {
    const char = text[index];

    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if (char === '"') {
      let end = index + 1;
      while (end < text.length && text[end] !== '"') {
        end += 1;
      }
      if (end >= text.length) {
        throw new Error('SYNTAX ERROR');
      }
      tokens.push({ type: 'string', value: text.slice(index + 1, end) });
      index = end + 1;
      continue;
    }

    const twoChar = text.slice(index, index + 2);
    if (['<=', '>=', '<>'].includes(twoChar)) {
      tokens.push({ type: 'operator', value: twoChar });
      index += 2;
      continue;
    }

    if ('+-*/^=(),<>\\'.includes(char)) {
      tokens.push({
        type: char === '(' ? 'lparen'
          : char === ')' ? 'rparen'
            : char === ',' ? 'comma'
              : 'operator',
        value: char
      });
      index += 1;
      continue;
    }

    if (/[A-Za-z]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[A-Za-z0-9$]/.test(text[end])) {
        end += 1;
      }
      tokens.push({ type: 'identifier', value: text.slice(index, end).toUpperCase() });
      index = end;
      continue;
    }

    if (/[0-9.]/.test(char)) {
      let end = index + 1;
      while (end < text.length && /[0-9.eE+-]/.test(text[end])) {
        const prev = text[end - 1];
        const current = text[end];
        if ((current === '+' || current === '-') && !/[eE]/.test(prev)) {
          break;
        }
        end += 1;
      }
      const raw = text.slice(index, end);
      if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?$/i.test(raw)) {
        throw new Error('SYNTAX ERROR');
      }
      tokens.push({ type: 'number', value: Number(raw) });
      index = end;
      continue;
    }

    throw new Error('SYNTAX ERROR');
  }

  return tokens;
}

function createExpressionParser(tokens) {
  let index = 0;

  function peek() {
    return tokens[index];
  }

  function consume() {
    return tokens[index++];
  }

  function match(type, value) {
    const token = peek();
    if (!token || token.type !== type || (value != null && token.value !== value)) {
      return false;
    }
    index += 1;
    return token;
  }

  function expect(type, value) {
    const token = match(type, value);
    if (!token) {
      throw new Error('SYNTAX ERROR');
    }
    return token;
  }

  function truthy(value) {
    return Number(value) !== 0;
  }

  function isStringValue(value) {
    return typeof value === 'string';
  }

  function coerceComparable(value) {
    return isStringValue(value) ? value : Number(value);
  }

  function concatOrAdd(left, right) {
    if (isStringValue(left) || isStringValue(right)) {
      return String(left) + String(right);
    }
    return Number(left) + Number(right);
  }

  function compare(left, operator, right) {
    const leftValue = coerceComparable(left);
    const rightValue = coerceComparable(right);
    switch (operator) {
      case '=':
        return leftValue == rightValue ? 1 : 0; // eslint-disable-line eqeqeq
      case '<>':
        return leftValue != rightValue ? 1 : 0; // eslint-disable-line eqeqeq
      case '<':
        return leftValue < rightValue ? 1 : 0;
      case '<=':
        return leftValue <= rightValue ? 1 : 0;
      case '>':
        return leftValue > rightValue ? 1 : 0;
      case '>=':
        return leftValue >= rightValue ? 1 : 0;
      default:
        throw new Error('SYNTAX ERROR');
    }
  }

  function parseBuiltIn(name, args) {
    switch (name) {
      case 'ABS':
        if (args.length !== 1) {
          throw new Error('SYNTAX ERROR');
        }
        return Math.abs(Number(args[0]));
      case 'ASC':
        if (args.length !== 1) {
          throw new Error('SYNTAX ERROR');
        }
        return String(args[0] || '').charCodeAt(0) || 0;
      case 'CHR$':
        if (args.length !== 1) {
          throw new Error('SYNTAX ERROR');
        }
        return String.fromCharCode(Number(args[0]) || 0);
      case 'INT':
        if (args.length !== 1) {
          throw new Error('SYNTAX ERROR');
        }
        return Math.floor(Number(args[0]));
      case 'LEFT$':
        if (args.length !== 2) {
          throw new Error('SYNTAX ERROR');
        }
        return String(args[0] || '').slice(0, Math.max(0, Number(args[1]) || 0));
      case 'LEN':
        if (args.length !== 1) {
          throw new Error('SYNTAX ERROR');
        }
        return String(args[0] || '').length;
      case 'MID$':
        if (args.length < 2 || args.length > 3) {
          throw new Error('SYNTAX ERROR');
        }
        return String(args[0] || '').slice(
          Math.max(0, Number(args[1]) - 1 || 0),
          args.length === 3 ? Math.max(0, Number(args[1]) - 1 || 0) + Math.max(0, Number(args[2]) || 0) : undefined
        );
      case 'RIGHT$':
        if (args.length !== 2) {
          throw new Error('SYNTAX ERROR');
        }
        return String(args[0] || '').slice(-Math.max(0, Number(args[1]) || 0));
      case 'RND':
        if (args.length > 1) {
          throw new Error('SYNTAX ERROR');
        }
        return Math.random();
      case 'SGN':
        if (args.length !== 1) {
          throw new Error('SYNTAX ERROR');
        }
        return Number(args[0]) < 0 ? -1 : Number(args[0]) > 0 ? 1 : 0;
      case 'STR$':
        if (args.length !== 1) {
          throw new Error('SYNTAX ERROR');
        }
        return String(args[0]);
      default:
        throw new Error('SYNTAX ERROR');
    }
  }

  function parseArrayOrFunction(name) {
    if (!match('lparen')) {
      if (name === 'RND') {
        return Math.random();
      }
      return getVar(name);
    }

    const args = [];
    if (!match('rparen')) {
      do {
        args.push(parseLogicalOr());
      } while (match('comma'));
      expect('rparen');
    }

    if (['ABS', 'ASC', 'CHR$', 'INT', 'LEFT$', 'LEN', 'MID$', 'RIGHT$', 'RND', 'SGN', 'STR$'].includes(name)) {
      return parseBuiltIn(name, args);
    }

    if (args.length !== 1) {
      throw new Error('SYNTAX ERROR');
    }

    const index = Number(args[0]);
    const array = ensureArray(name, name.endsWith('$'), index);
    if (!Number.isFinite(index) || index < 0 || index >= array.values.length) {
      return name.endsWith('$') ? '' : 0;
    }
    return array.values[index];
  }

  function parsePrimary() {
    const token = peek();
    if (!token) {
      throw new Error('SYNTAX ERROR');
    }

    if (token.type === 'number' || token.type === 'string') {
      consume();
      return token.value;
    }

    if (token.type === 'identifier') {
      consume();
      const name = token.value;
      return parseArrayOrFunction(name);
    }

    if (match('lparen')) {
      const value = parseLogicalOr();
      expect('rparen');
      return value;
    }

    throw new Error('SYNTAX ERROR');
  }

  function parseUnary() {
    const token = peek();
    if (token?.type === 'operator' && token.value === '+') {
      consume();
      return +parseUnary();
    }
    if (token?.type === 'operator' && token.value === '-') {
      consume();
      return -parseUnary();
    }
    if (token?.type === 'identifier' && token.value === 'NOT') {
      consume();
      return truthy(parseUnary()) ? 0 : 1;
    }
    return parsePrimary();
  }

  function parsePower() {
    let left = parseUnary();
    while (match('operator', '^')) {
      const right = parseUnary();
      left = left ** Number(right);
    }
    return left;
  }

  function parseMultiplicative() {
    let left = parsePower();
    while (true) {
      if (match('operator', '*')) {
        left = left * parsePower();
        continue;
      }
      if (match('operator', '/')) {
        left = left / parsePower();
        continue;
      }
      if (match('operator', '\\')) {
        left = Math.trunc(Number(left) / Number(parsePower()));
        continue;
      }
      if (peek()?.type === 'identifier' && peek().value === 'MOD') {
        consume();
        left = Number(left) % Number(parsePower());
        continue;
      }
      break;
    }
    return left;
  }

  function parseAdditive() {
    let left = parseMultiplicative();
    while (true) {
      if (match('operator', '+')) {
        left = concatOrAdd(left, parseMultiplicative());
        continue;
      }
      if (match('operator', '-')) {
        left = left - parseMultiplicative();
        continue;
      }
      break;
    }
    return left;
  }

  function parseComparison() {
    let left = parseAdditive();
    while (true) {
      const token = peek();
      if (!token || token.type !== 'operator') {
        break;
      }

      if (!['=', '<>', '<', '<=', '>', '>='].includes(token.value)) {
        break;
      }

      consume();
      left = compare(left, token.value, parseAdditive());
    }
    return left;
  }

  function parseLogicalAnd() {
    let left = parseComparison();
    while (peek()?.type === 'identifier' && peek().value === 'AND') {
      consume();
      left = truthy(left) && truthy(parseComparison()) ? 1 : 0;
    }
    return left;
  }

  function parseLogicalOr() {
    let left = parseLogicalAnd();
    while (peek()?.type === 'identifier' && peek().value === 'OR') {
      consume();
      left = truthy(left) || truthy(parseLogicalAnd()) ? 1 : 0;
    }
    return left;
  }

  return {
    parse() {
      const value = parseLogicalOr();
      if (index !== tokens.length) {
        throw new Error('SYNTAX ERROR');
      }
      return value;
    }
  };
}

function getVar(name) {
  const key = String(name || '').toUpperCase();
  if (runtime.variables.has(key)) {
    return runtime.variables.get(key);
  }
  if (runtime.arrays.has(key)) {
    const array = runtime.arrays.get(key);
    return array.values[0] ?? (key.endsWith('$') ? '' : 0);
  }
  return key.endsWith('$') ? '' : 0;
}

function setVar(name, value) {
  runtime.variables.set(name.toUpperCase(), value);
}

function evaluate(expression) {
  const trimmed = expression.trim();
  if (/^"[^"]*"$/.test(trimmed)) {
    return trimmed.slice(1, -1);
  }
  if (/^[A-Z][A-Z0-9]?\$?$/i.test(trimmed)) {
    return getVar(trimmed);
  }
  if (/^[+-]?(?:\d+\.?\d*|\.\d+)(?:E[+-]?\d+)?$/i.test(trimmed)) {
    return Number(trimmed);
  }

  const tabMatch = trimmed.match(/^TAB\s*\(\s*(.+)\s*\)$/i);
  if (tabMatch) {
    tabToColumn(evaluate(tabMatch[1]));
    return '';
  }

  try {
    const tokens = tokenizeExpression(trimmed);
    return createExpressionParser(tokens).parse();
  } catch (error) {
    throw new Error(`SYNTAX ERROR IN ${expression}`);
  }
}

function printStatement(statement) {
  const body = statement.replace(/^PRINT\s*/i, '');
  if (!body.trim()) {
    printLine();
    return;
  }

  const suppressNewline = /[;,]\s*$/.test(body);
  const items = parsePrintItems(body);
  for (const item of items) {
    if (item.expression) {
      const value = evaluate(item.expression);
      if (value !== '') {
        print(String(value));
      }
    }

    if (item.separator === ',') {
      print(' ');
    }
  }
  if (!suppressNewline) {
    printLine();
  }
}

function assignStatement(statement) {
  const assignment = statement.replace(/^LET\s+/i, '');
  const pair = splitAssignment(assignment);
  if (!pair) {
    throw new Error('SYNTAX ERROR');
  }

  assignTarget(pair.left, evaluate(pair.right));
}

function buildProgramIndex() {
  const lines = [...runtime.program.entries()].sort((a, b) => a[0] - b[0]);
  const lineToIndex = new Map(lines.map(([lineNumber], index) => [lineNumber, index]));
  return { lines, lineToIndex };
}

async function executeSingleStatement(statement, context) {
  const upper = statement.toUpperCase();

  if (upper.startsWith('REM')) {
    return {};
  }

  if (upper.startsWith('DATA')) {
    return {};
  }

  if (upper.startsWith('DIM')) {
    const declaration = statement.replace(/^DIM\s*/i, '');
    for (const item of splitListItems(declaration)) {
      const match = item.match(/^([A-Z][A-Z0-9]?\$?)\s*\(\s*(\d+)\s*\)$/i);
      if (!match) {
        throw new Error('SYNTAX ERROR');
      }
      ensureArray(match[1], match[1].endsWith('$'), Number(match[2]));
    }
    return {};
  }

  if (upper.startsWith('PRINT')) {
    printStatement(statement);
    return {};
  }

  const assignment = splitAssignment(statement.replace(/^LET\s+/i, ''));
  if (assignment && isAssignableTarget(assignment.left)) {
    assignStatement(statement);
    return {};
  }

  if (upper.startsWith('GOTO')) {
    return { jumpToLineNumber: Number(evaluate(statement.replace(/^GOTO\s*/i, ''))) };
  }

  if (upper.startsWith('READ')) {
    const items = splitListItems(statement.replace(/^READ\s*/i, ''));
    for (const item of items) {
      assignTarget(item, readDataValue());
    }
    return {};
  }

  if (upper.startsWith('RESTORE')) {
    runtime.dataPointer = 0;
    return {};
  }

  if (upper.startsWith('ON ')) {
    const onMatch = statement.match(/^ON\s+(.+)\s+GOTO\s+(.+)$/i);
    if (!onMatch) {
      throw new Error('SYNTAX ERROR');
    }

    const targetIndex = Number(evaluate(onMatch[1]));
    const targets = onMatch[2].split(',').map((part) => Number(evaluate(part.trim())));
    if (targetIndex >= 1 && targetIndex <= targets.length) {
      return { jumpToLineNumber: targets[targetIndex - 1] };
    }
    return {};
  }

  if (upper.startsWith('IF')) {
    const parts = splitIfStatement(statement);
    if (!parts) {
      throw new Error('SYNTAX ERROR');
    }

    if (!evaluate(parts.condition)) {
      if (!parts.elseBody) {
        return {};
      }
      return (await executeImmediate(parts.elseBody, { quietReady: true, suppressPrompt: true })) || {};
    }

    if (/^\d+$/.test(parts.thenBody)) {
      return { jumpToLineNumber: Number(parts.thenBody) };
    }

    return (await executeImmediate(parts.thenBody, { quietReady: true, suppressPrompt: true })) || {};
  }

  if (upper.startsWith('FOR')) {
    handleFor(statement, context.forStack, context.pointer);
    return {};
  }

  if (upper.startsWith('NEXT')) {
    const nextPointer = handleNext(statement, context.forStack, context.pointer);
    if (nextPointer !== context.pointer) {
      return { jumpToLineNumber: context.lines[nextPointer][0] };
    }
    return {};
  }

  if (upper.startsWith('INPUT')) {
    runtime.awaitingInput = { statement, resumeAt: context.pointer + 1 };
    runtime.execution = {
      lines: context.lines,
      lineToIndex: context.lineToIndex,
      forStack: context.forStack,
      pointer: context.pointer + 1
    };
    printInputPrompt(statement);
    runtime.promptActive = false;
    setInputEnabled(true);
    screenElement.focus();
    return { suspend: true };
  }

  if (upper === 'END' || upper === 'STOP') {
    return { stop: true };
  }

  throw new Error(`?SYNTAX ERROR IN ${context.lineNumber}`);
}

async function executeStatementChain(text, context) {
  const statements = splitStatements(text);
  for (const statement of statements) {
    const result = await executeSingleStatement(statement, context);
    if (result.suspend || result.stop || result.jumpToLineNumber != null) {
      return result;
    }
  }
  return {};
}

async function runProgram(state) {
  const runToken = runtime.runToken;
  const programState = state || {
    ...buildProgramIndex(),
    forStack: [],
    pointer: 0
  };
  const { lines, lineToIndex, forStack } = programState;
  let pointer = programState.pointer;
  let steps = 0;

  while (pointer < lines.length) {
    if (runToken !== runtime.runToken) {
      return { aborted: true };
    }

    if (steps++ > 10000) {
      throw new Error('LOOP LIMIT EXCEEDED');
    }

    const [lineNumber, statement] = lines[pointer];

    const result = await executeStatementChain(statement, {
      lineNumber,
      lines,
      lineToIndex,
      forStack,
      pointer
    });

    if (result.suspend) {
      return { suspended: true };
    }

    if (result.stop) {
      printLine('READY.');
      return { suspended: false };
    }

    if (result.jumpToLineNumber != null) {
      if (!lineToIndex.has(result.jumpToLineNumber)) {
        throw new Error('?UNDEFINED STATEMENT ERROR');
      }
      pointer = lineToIndex.get(result.jumpToLineNumber);
      await nextFrame();
      if (runToken !== runtime.runToken) {
        return { aborted: true };
      }
      continue;
    }

    pointer += 1;
    await nextFrame();
    if (runToken !== runtime.runToken) {
      return { aborted: true };
    }
  }

  if (runToken !== runtime.runToken) {
    return { aborted: true };
  }
  printLine('READY.');
  return { suspended: false };
}

function jumpToLine(targetExpression, lineToIndex) {
  const target = Number(evaluate(targetExpression));
  if (!lineToIndex.has(target)) {
    throw new Error('?UNDEFINED STATEMENT ERROR');
  }
  return lineToIndex.get(target);
}

function handleFor(statement, forStack, pointer) {
  const match = statement.match(/^FOR\s*([A-Z][A-Z0-9]?)\s*=\s*(.+?)\s*TO\s*(.+?)(?:\s*STEP\s*(.+))?$/i);
  if (!match) {
    throw new Error('SYNTAX ERROR');
  }

  const variable = match[1].toUpperCase();
  setVar(variable, evaluate(match[2]));
  forStack.push({
    variable,
    limit: Number(evaluate(match[3])),
    step: match[4] ? Number(evaluate(match[4])) : 1,
    pointer
  });
}

function handleNext(statement, forStack, pointer) {
  const variableMatch = statement.match(/^NEXT\s*([A-Z][A-Z0-9]?)?/i);
  const variable = variableMatch?.[1]?.toUpperCase();
  const frame = [...forStack].reverse().find((entry) => !variable || entry.variable === variable);
  if (!frame) {
    throw new Error('?NEXT WITHOUT FOR ERROR');
  }

  const nextValue = Number(getVar(frame.variable)) + frame.step;
  setVar(frame.variable, nextValue);
  if ((frame.step >= 0 && nextValue <= frame.limit) || (frame.step < 0 && nextValue >= frame.limit)) {
    return frame.pointer + 1;
  }

  forStack.splice(forStack.indexOf(frame), 1);
  return pointer;
}

function printInputPrompt(statement) {
  const match = statement.match(/^INPUT\s*(?:"([^"]*)"\s*;\s*)?([A-Z][A-Z0-9]?\$?)$/i);
  if (!match) {
    throw new Error('SYNTAX ERROR');
  }
  print(match[1] ? `${match[1]}? ` : '? ');
}

async function completeInput(value) {
  const match = runtime.awaitingInput.statement.match(/^INPUT\s*(?:"([^"]*)"\s*;\s*)?([A-Z][A-Z0-9]?\$?)$/i);
  const variable = match[2].toUpperCase();
  setVar(variable, variable.endsWith('$') ? value : Number(value));
  const execution = runtime.execution;
  runtime.awaitingInput = null;
  runtime.execution = null;
  await runProgram(execution);
}

async function executeImmediate(command, options = {}) {
  const normalized = normalizeLine(command);

  if (!normalized) {
    return;
  }

  if (storeProgramLine(normalized)) {
    return;
  }

  const upper = normalized.toUpperCase();

  if (upper === 'RUN') {
    runtime.runToken += 1;
    runtime.variables.clear();
    runtime.arrays.clear();
    runtime.execution = null;
    runtime.dataPointer = 0;
    setInputEnabled(false);
    const runToken = runtime.runToken;
    await runProgram();
    if (runToken === runtime.runToken) {
      setInputEnabled(true);
      screenElement.focus();
      if (!runtime.awaitingInput) {
        printPrompt();
      }
    }
  } else if (upper === 'LIST') {
    listProgram();
  } else if (upper === 'NEW') {
    runtime.program.clear();
    runtime.variables.clear();
    runtime.arrays.clear();
    runtime.execution = null;
    runtime.data = [];
    runtime.dataPointer = 0;
    printLine('READY.');
    if (!options.quietReady) printPrompt();
  } else if (upper === 'CLEAR') {
    runtime.variables.clear();
    runtime.arrays.clear();
    printLine('READY.');
    if (!options.quietReady) printPrompt();
  } else if (upper.startsWith('PRINT') && splitStatements(normalized).length === 1) {
    printStatement(normalized);
    if (!options.quietReady) {
      printLine('READY.');
      printPrompt();
    }
  } else {
    const assignment = splitAssignment(normalized.replace(/^LET\s+/i, ''));
    if (assignment && isAssignableTarget(assignment.left) && splitStatements(normalized).length === 1) {
      assignStatement(normalized);
      if (!options.quietReady) {
        printLine('READY.');
        printPrompt();
      }
    } else if (upper === 'HELP') {
      printLine('COMMANDS: RUN, LIST, NEW, CLEAR, PRINT, LET, INPUT, IF/THEN, GOTO, FOR/NEXT, END');
      printPrompt();
    } else {
      const result = await executeStatementChain(normalized, {
        lineNumber: 0,
        lines: [],
        lineToIndex: new Map(),
        forStack: [],
        pointer: 0
      });

      if (result.suspend || result.stop || result.jumpToLineNumber != null) {
        return result;
      }

      if (!options.quietReady && !options.suppressPrompt) {
        printLine('READY.');
        printPrompt();
      }
    }
  }
}

async function submitCommand(command) {
  printLine();
  runtime.promptActive = false;
  runtime.history.push(command);

  try {
    if (runtime.awaitingInput) {
      setInputEnabled(false);
      await completeInput(command);
      setInputEnabled(true);
      if (!runtime.awaitingInput) {
        printPrompt();
      }
    } else {
      await executeImmediate(command);
    }
  } catch (error) {
    printLine(error.message);
    printLine('READY.');
    runtime.awaitingInput = null;
    runtime.execution = null;
    setInputEnabled(true);
    printPrompt();
  }
}

async function loadDemo() {
  setInputEnabled(false);
  beginSystemOutput();
  runtime.promptActive = false;
  runtime.program.clear();
  loadedProgramElement.textContent = 'ELIZA.BAS loaded.';
  try {
    const response = await fetch('./ELIZA.BAS');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const source = await response.text();
    loadProgramSource(source);
    printLine('DEMO PROGRAM LOADED.');
    listProgram();
    await executeImmediate('RUN');
  } catch (error) {
    printLine(`LOAD ERROR: ${error.message}`);
    printLine('READY.');
    printPrompt();
  } finally {
    setInputEnabled(true);
  }
}

async function loadPreparedProgram() {
  setInputEnabled(false);
  loadPreparedButton.disabled = true;
  loadPreparedButton.textContent = 'Loading...';
  beginSystemOutput();
  runtime.promptActive = false;
  try {
    const program = await invoke('getLatestPreparedProgram', {});
    if (!program) {
      loadedProgramElement.textContent = 'No prepared macro program found for this user.';
      printLine('NO PREPARED PROGRAM FOUND.');
      printLine('READY.');
      printPrompt();
      return;
    }
    loadProgramSource(program.source);
    loadedProgramElement.textContent = `${program.title || 'Untitled BASIC program'}: ${getProgramLineCount(program)} lines prepared from Confluence.`;
    printLine(`LOADED PREPARED PROGRAM: ${program.title}`);
    listProgram();
    printLine('READY.');
    printPrompt();
  } catch (error) {
    loadedProgramElement.textContent = `Unable to load prepared program: ${error.message}`;
    printLine(`LOAD ERROR: ${error.message}`);
    printLine('READY.');
    printPrompt();
  } finally {
    loadPreparedButton.disabled = false;
    loadPreparedButton.textContent = 'Load prepared';
    setInputEnabled(true);
    screenElement.focus();
  }
}

function buildPageTitle() {
  return BASIC_FIRST_GAME_TITLE || '1CHECK';
}

function randomUuid() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildFirstGameAdfDocument() {
  const source = String(BASIC_FIRST_GAME_SOURCE || '').replace(/\r\n?/g, '\n').trimEnd();
  const title = buildPageTitle();

  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'heading',
        attrs: { level: 1 },
        content: [{ type: 'text', text: title }]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'This proof page carries one macro body and a short reference for Microsoft BASIC 6502.' }
        ]
      },
      {
        type: 'heading',
        attrs: { level: 2 },
        content: [{ type: 'text', text: 'Mini manual' }]
      },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Programs must use numbered lines. The runner prepares, stores, and executes the numbered source as typed.' }]
              }
            ]
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Use PRINT, INPUT, FOR/NEXT, IF THEN, DATA/READ, and arrays. The runner accepts the features used by the demo listings.' }]
              }
            ]
          },
          {
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: 'Create one listing first, verify it, then scale the same macro body shape to the rest of the catalog.' }]
              }
            ]
          }
        ]
      },
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '1CHECK macro' }
        ]
      },
      {
        type: 'bodiedExtension',
        attrs: {
          extensionKey: '56be77c8-a94a-4580-a686-76856c812c75/65a2485d-b216-421d-a172-a6abefca842e/static/basic-m6502-macro',
          extensionType: 'com.atlassian.ecosystem',
          text: title,
          layout: 'default',
          localId: randomUuid(),
          parameters: {
            localId: randomUuid(),
            extensionId: 'ari:cloud:ecosystem::extension/56be77c8-a94a-4580-a686-76856c812c75/65a2485d-b216-421d-a172-a6abefca842e/static/basic-m6502-macro',
            extensionTitle: 'Microsoft 6502 BASIC (Development)',
            layout: 'extension',
            forgeEnvironment: 'DEVELOPMENT',
            embeddedMacroContext: {
              extensionData: {
                type: 'macro'
              }
            }
          }
        },
        content: [
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: title }]
          },
          {
            type: 'codeBlock',
            attrs: {
              language: 'none'
            },
            content: [
              {
                type: 'text',
                text: source
              }
            ]
          }
        ]
      }
    ]
  };
}

async function resolveSpaceId(spaceKey) {
  const response = await requestConfluence(`/wiki/api/v2/spaces?keys=${encodeURIComponent(spaceKey)}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to look up space ${spaceKey}: HTTP ${response.status}`);
  }

  const payload = await response.json();
  const space = payload?.results?.[0];
  if (!space?.id) {
    throw new Error(`No space found for key ${spaceKey}`);
  }

  return space.id;
}

async function createGamesPage() {
  const spaceKey = pageSpaceKeyInput.value.trim();
  if (!spaceKey) {
    setPageCreationStatus('Enter a Confluence space key first.');
    return;
  }

  createGamesPageButton.disabled = true;
  createGamesPageButton.textContent = 'Creating...';
  setPageCreationStatus('Creating Confluence page from BASIC listings.');

  try {
    const spaceId = await resolveSpaceId(spaceKey);
    const response = await requestConfluence('/wiki/api/v2/pages', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        spaceId,
        status: 'current',
        title: buildPageTitle(),
        body: {
          representation: 'atlas_doc_format',
          value: JSON.stringify(buildFirstGameAdfDocument())
        },
        subtype: 'live'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const created = await response.json();
    const pageUrl = created?._links?.webui ? `${created._links.base || ''}${created._links.webui}` : 'created page';
    setPageCreationStatus(`Created ${buildPageTitle()} in ${spaceKey}: ${pageUrl}`);
    loadedProgramElement.textContent = `Created ${buildPageTitle()} in space ${spaceKey}.`;
  } catch (error) {
    setPageCreationStatus(`Unable to create Confluence page: ${error.message}`);
  } finally {
    createGamesPageButton.disabled = false;
    createGamesPageButton.textContent = 'Create games page';
  }
}

screenElement.addEventListener('keydown', async (event) => {
  if (!runtime.inputEnabled) {
    event.preventDefault();
    return;
  }

  if (event.key === 'Enter') {
    event.preventDefault();
    const command = runtime.inputLine;
    runtime.inputLine = '';
    runtime.promptActive = false;
    await submitCommand(command);
  } else if (event.key === 'Backspace') {
    event.preventDefault();
    if (runtime.inputLine.length > 0) {
      runtime.inputLine = runtime.inputLine.slice(0, -1);
      screenElement.textContent = screenElement.textContent.slice(0, -1);
    }
  } else if (event.key === 'Escape') {
    event.preventDefault();
    while (runtime.inputLine.length > 0) {
      runtime.inputLine = runtime.inputLine.slice(0, -1);
      screenElement.textContent = screenElement.textContent.slice(0, -1);
    }
  } else if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
    event.preventDefault();
    runtime.inputLine += event.key;
    print(event.key);
  }
});

screenElement.addEventListener('pointerdown', () => screenElement.focus());
paletteSelect.addEventListener('change', () => setPalette(paletteSelect.value));
fontSizeRange.addEventListener('input', () => setFontSize(fontSizeRange.value));

runDemoButton.addEventListener('click', loadDemo);
resetButton.addEventListener('click', boot);
loadPreparedButton.addEventListener('click', loadPreparedProgram);
createGamesPageButton.addEventListener('click', createGamesPage);

applySavedPreferences();
boot();
loadPreparedProgram();
