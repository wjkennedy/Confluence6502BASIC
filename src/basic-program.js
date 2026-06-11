'use strict';

const MAX_PROGRAM_BYTES = 64 * 1024;
const KNOWN_COMMANDS = new Set([
  'CLEAR',
  'DATA',
  'DEF',
  'DIM',
  'END',
  'FOR',
  'GET',
  'GOSUB',
  'GOTO',
  'IF',
  'INPUT',
  'LET',
  'LIST',
  'LOAD',
  'NEW',
  'NEXT',
  'ON',
  'POKE',
  'PRINT',
  'READ',
  'REM',
  'RESTORE',
  'RETURN',
  'RUN',
  'SAVE',
  'STOP',
  'SYS',
  'WAIT'
]);

const HTML_ENTITY_MAP = Object.freeze({
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
  nbsp: ' '
});

function decodeHtmlEntities(value) {
  let output = String(value ?? '');
  for (let pass = 0; pass < 4; pass += 1) {
    const next = output
      .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
        const lower = entity.toLowerCase();
        if (lower.startsWith('#x')) {
          const codePoint = Number.parseInt(lower.slice(2), 16);
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
        }
        if (lower.startsWith('#')) {
          const codePoint = Number.parseInt(lower.slice(1), 10);
          return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
        }
        return Object.prototype.hasOwnProperty.call(HTML_ENTITY_MAP, lower)
          ? HTML_ENTITY_MAP[lower]
          : match;
      });

    if (next === output) {
      break;
    }
    output = next;
  }

  return output;
}

function normalizeBasicSource(source) {
  return decodeHtmlEntities(source)
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\s+$/g, ''))
    .join('\n')
    .trim();
}

function parseBasicProgram(source) {
  const normalized = normalizeBasicSource(source);
  if (!normalized) {
    return {
      normalized,
      lines: [],
      commands: [],
      warnings: ['Program is empty.']
    };
  }

  const seen = new Set();
  const commands = new Set();
  const warnings = [];
  const lines = normalized.split('\n').map((text, index) => {
    const match = text.match(/^(\d+)\s*(.*)$/);
    if (!match) {
      warnings.push(`Line ${index + 1} has no BASIC line number.`);
      return { index: index + 1, text, lineNumber: null, statement: text };
    }

    const lineNumber = Number(match[1]);
    const statement = match[2].trim();
    if (seen.has(lineNumber)) {
      warnings.push(`Line number ${lineNumber} is duplicated.`);
    }
    seen.add(lineNumber);

    if (statement) {
      const command = statement.split(/\s+/)[0].replace(/[^A-Z]/gi, '').toUpperCase();
      if (command) {
        commands.add(command);
        if (!KNOWN_COMMANDS.has(command) && !/^[A-Z][A-Z0-9]?\$?=/.test(statement.toUpperCase())) {
          warnings.push(`Line ${lineNumber} uses command ${command}, which the runner may not emulate yet.`);
        }
      }
    }

    return { index: index + 1, text, lineNumber, statement };
  });

  let previous = -1;
  for (const line of lines) {
    if (line.lineNumber == null) {
      continue;
    }
    if (line.lineNumber <= previous) {
      warnings.push(`Line number ${line.lineNumber} is not greater than the previous numbered line.`);
    }
    previous = line.lineNumber;
  }

  return {
    normalized,
    lines,
    commands: [...commands].sort(),
    warnings
  };
}

function analyzeBasicProgram(source) {
  const parsed = parseBasicProgram(source);
  const numberedLines = parsed.lines.filter((line) => line.lineNumber != null);
  return {
    normalized: parsed.normalized,
    lineCount: parsed.lines.length,
    numberedLineCount: numberedLines.length,
    firstLine: numberedLines[0]?.lineNumber || null,
    lastLine: numberedLines.at(-1)?.lineNumber || null,
    commands: parsed.commands,
    warnings: parsed.warnings,
    byteLength: Buffer.byteLength(parsed.normalized, 'utf8')
  };
}

function validatePreparedProgram(input = {}) {
  const title = String(input.title || 'Untitled BASIC program').trim().slice(0, 120);
  const analysis = analyzeBasicProgram(input.source);

  if (!analysis.normalized) {
    throw new Error('BASIC source is required.');
  }
  if (analysis.byteLength > MAX_PROGRAM_BYTES) {
    throw new Error(`BASIC source must be ${MAX_PROGRAM_BYTES} bytes or less.`);
  }
  if (analysis.numberedLineCount !== analysis.lineCount) {
    throw new Error('Every executable BASIC line must start with a line number.');
  }

  return {
    title,
    source: analysis.normalized,
    analysis
  };
}

module.exports = {
  MAX_PROGRAM_BYTES,
  analyzeBasicProgram,
  decodeHtmlEntities,
  normalizeBasicSource,
  parseBasicProgram,
  validatePreparedProgram
};
