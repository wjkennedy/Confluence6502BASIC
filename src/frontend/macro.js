import { invoke, router, view } from '@forge/bridge';

const RUNNER_MODULE_KEY = 'basic-m6502-runner-page';

const titleInput = document.getElementById('programTitle');
const sourceInput = document.getElementById('basicSource');
const prepareButton = document.getElementById('prepareButton');
const formattedOutput = document.getElementById('formattedOutput');
const statusElement = document.getElementById('status');
const lineCountElement = document.getElementById('lineCount');
const lineRangeElement = document.getElementById('lineRange');
const commandCountElement = document.getElementById('commandCount');

let debounceTimer;

function extractTextFromNode(node) {
  if (node == null) {
    return '';
  }

  if (typeof node === 'string') {
    return node;
  }

  if (Array.isArray(node)) {
    return node.map(extractTextFromNode).filter(Boolean).join('\n');
  }

  if (typeof node === 'object') {
    if (typeof node.text === 'string') {
      return node.text;
    }

    if (typeof node.value === 'string') {
      return node.value;
    }

    if (typeof node.content === 'string') {
      return node.content;
    }

    if (Array.isArray(node.content)) {
      return node.content.map(extractTextFromNode).filter(Boolean).join('\n');
    }

    return Object.values(node).map(extractTextFromNode).filter(Boolean).join('\n');
  }

  return '';
}

function parseMacroSeed(body, fallbackTitle = '') {
  const text = extractTextFromNode(body).replace(/\r\n?/g, '\n').trim();
  if (!text) {
    return fallbackTitle ? { title: fallbackTitle, source: '' } : null;
  }

  const titleMatch = text.match(/^TITLE:\s*(.*)$/m);
  const sourceMatch = text.match(/^SOURCE:\s*\n([\s\S]*)$/m);

  if (titleMatch || sourceMatch) {
    return {
      title: titleMatch ? titleMatch[1].trim() : '',
      source: sourceMatch ? sourceMatch[1].trimEnd() : ''
    };
  }

  return {
    title: fallbackTitle,
    source: text
  };
}

function localAnalyze(source) {
  const normalized = source.replace(/\r\n?/g, '\n').trim();
  const lines = normalized ? normalized.split('\n') : [];
  const commands = new Set();
  const warnings = [];
  const numbered = [];

  lines.forEach((line, index) => {
    const match = line.match(/^(\d+)\s*(.*)$/);
    if (!match) {
      warnings.push(`Line ${index + 1} has no BASIC line number.`);
      return;
    }
    numbered.push(Number(match[1]));
    const command = match[2].trim().split(/\s+/)[0]?.replace(/[^A-Z]/gi, '').toUpperCase();
    if (command) {
      commands.add(command);
    }
  });

  return {
    normalized,
    lineCount: lines.length,
    numberedLineCount: numbered.length,
    firstLine: numbered[0] || null,
    lastLine: numbered.at(-1) || null,
    commands: [...commands].sort(),
    warnings
  };
}

function renderAnalysis(analysis) {
  lineCountElement.textContent = String(analysis.lineCount);
  lineRangeElement.textContent = analysis.firstLine == null ? '-' : `${analysis.firstLine}-${analysis.lastLine}`;
  commandCountElement.textContent = String(analysis.commands.length);
  formattedOutput.textContent = analysis.normalized || 'Enter line-numbered BASIC source.';

  if (analysis.warnings.length > 0) {
    statusElement.textContent = analysis.warnings.join(' ');
  } else if (analysis.normalized) {
    statusElement.textContent = `Ready to prepare. Commands: ${analysis.commands.join(', ') || 'none'}.`;
  } else {
    statusElement.textContent = 'Waiting for BASIC source.';
  }
}

async function analyze() {
  const source = sourceInput.value;
  renderAnalysis(localAnalyze(source));
  try {
    const analysis = await invoke('analyzeBasicProgram', { source });
    renderAnalysis(analysis);
  } catch (error) {
    statusElement.textContent = `Local preview shown. Resolver analysis unavailable: ${error.message}`;
  }
}

async function hydrateFromContext() {
  if (!view?.getContext) {
    return;
  }

  const context = await view.getContext();
  const fallbackTitle = context?.extension?.text || context?.extension?.macro?.text || '';
  const seed = parseMacroSeed(context?.extension?.macro?.body, fallbackTitle);
  if (!seed) {
    return;
  }

  if (seed.title) {
    titleInput.value = seed.title;
  }

  if (seed.source) {
    sourceInput.value = seed.source;
  }
}

async function initialize() {
  try {
    await hydrateFromContext();
  } catch (error) {
    statusElement.textContent = `Macro context unavailable: ${error.message}`;
  }

  await analyze();
}

function scheduleAnalyze() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(analyze, 150);
}

async function prepareProgram() {
  prepareButton.disabled = true;
  prepareButton.textContent = 'Preparing...';
  statusElement.textContent = 'Preparing program for runner.';

  try {
    const result = await invoke('prepareProgram', {
      title: titleInput.value,
      source: sourceInput.value
    });
    statusElement.textContent = `Prepared ${result.title}. Opening BASIC runner.`;
    await router.navigate({ target: 'module', moduleKey: RUNNER_MODULE_KEY });
  } catch (error) {
    statusElement.textContent = `Unable to prepare program: ${error.message}`;
  } finally {
    prepareButton.disabled = false;
    prepareButton.textContent = 'Prepare for runner';
  }
}

sourceInput.addEventListener('input', scheduleAnalyze);
titleInput.addEventListener('input', scheduleAnalyze);
prepareButton.addEventListener('click', prepareProgram);

initialize();

globalThis.__macro = {
  extractTextFromNode,
  hydrateFromContext,
  initialize,
  parseMacroSeed
};
