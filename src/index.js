'use strict';

const { randomUUID } = require('node:crypto');
const {
  analyzeBasicProgram,
  decodeHtmlEntities,
  validatePreparedProgram
} = require('./basic-program');

let Resolver;
let kvs;
try {
  const resolverModule = require('@forge/resolver');
  Resolver = resolverModule.default || resolverModule;
} catch (error) {
  Resolver = null;
}
try {
  kvs = require('@forge/kvs').kvs;
} catch (error) {
  kvs = null;
}

const MACRO_MODULE_KEY = 'basic-m6502-macro';
const RUNNER_MODULE_KEY = 'basic-m6502-runner-page';
const PROGRAM_KEY_PREFIX = 'prepared-program';
const LATEST_PROGRAM_KEY_PREFIX = 'latest-prepared-program';

const RUNTIME_METADATA = Object.freeze({
  name: 'Microsoft BASIC for 6502 Microprocessor',
  macroVersion: '0.1.0',
  runtime: 'Confluence app page BASIC compatibility runtime',
  supportedSurfaces: ['confluence:macro', 'confluence:globalPage']
});

function getRuntimeMetadata() {
  return RUNTIME_METADATA;
}

function getModuleKey(context = {}) {
  return context?.extension?.moduleKey || context?.moduleKey || context?.extension?.key;
}

function getModuleType(context = {}) {
  return context?.extension?.type || context?.type;
}

function requireModuleContext(context = {}, allowedModuleKeys = [], allowedModuleTypes = []) {
  const moduleKey = getModuleKey(context);
  const moduleType = getModuleType(context);
  if (!allowedModuleKeys.includes(moduleKey) && !allowedModuleTypes.includes(moduleType)) {
    throw new Error(`This resolver is only available to: ${allowedModuleKeys.join(', ')}.`);
  }
}

function requireConfluenceMacroContext(context = {}) {
  requireModuleContext(context, [MACRO_MODULE_KEY]);
}

function requireConfluenceRunnerContext(context = {}) {
  requireModuleContext(context, [RUNNER_MODULE_KEY], ['confluence:globalPage']);
}

function requireStorage() {
  if (!kvs) {
    throw new Error('Forge KVS is not available in this runtime.');
  }
  return kvs;
}

function buildProgramStorageKey(programId) {
  return `${PROGRAM_KEY_PREFIX}:${programId}`;
}

function getAccountId(context = {}) {
  return context.accountId || context.principal?.accountId || 'unknown-user';
}

function buildLatestProgramStorageKey(context = {}) {
  return `${LATEST_PROGRAM_KEY_PREFIX}:${getAccountId(context)}`;
}

function assertProgramVisibleToContext(program, context = {}) {
  const accountId = getAccountId(context);
  if (program?.ownerAccountId && program.ownerAccountId !== accountId) {
    throw new Error('Prepared BASIC program is not available to this user.');
  }
}

function normalizeStoredProgram(program) {
  if (!program) {
    return null;
  }

  const source = decodeHtmlEntities(program.source || '');
  return {
    ...program,
    title: String(program.title || 'Untitled BASIC program'),
    source,
    analysis: program.analysis || analyzeBasicProgram(source)
  };
}

async function prepareProgram(input = {}, context = {}) {
  requireConfluenceMacroContext(context);
  const prepared = validatePreparedProgram(input);
  const ownerAccountId = getAccountId(context);
  const now = new Date().toISOString();
  const program = {
    id: randomUUID(),
    title: prepared.title,
    source: prepared.source,
    analysis: prepared.analysis,
    ownerAccountId,
    createdAt: now,
    updatedAt: now
  };

  const forgeStorage = requireStorage();
  await forgeStorage.set(buildProgramStorageKey(program.id), program);
  await forgeStorage.set(buildLatestProgramStorageKey(context), program.id);
  return {
    programId: program.id,
    title: program.title,
    analysis: program.analysis
  };
}

async function getPreparedProgram(input = {}, context = {}) {
  requireConfluenceRunnerContext(context);
  const programId = String(input.programId || '').trim();
  if (!programId) {
    return null;
  }

  const program = normalizeStoredProgram(await requireStorage().get(buildProgramStorageKey(programId)));
  if (!program) {
    return null;
  }

  assertProgramVisibleToContext(program, context);
  return program;
}

async function getLatestPreparedProgram(input = {}, context = {}) {
  requireConfluenceRunnerContext(context);
  const forgeStorage = requireStorage();
  const programId = await forgeStorage.get(buildLatestProgramStorageKey(context));
  if (!programId) {
    return null;
  }
  return getPreparedProgram({ programId }, context);
}

function setStorageForTests(nextStorage) {
  kvs = nextStorage;
}

function requireLegacyMacroContext(context = {}) {
  const moduleKey = context?.extension?.moduleKey;
  if (moduleKey !== MACRO_MODULE_KEY) {
    throw new Error('This resolver is only available to the BASIC M6502 Confluence macro.');
  }
}

function createResolver() {
  if (!Resolver) {
    return null;
  }

  const resolver = new Resolver();

  resolver.define('getRuntimeMetadata', ({ context }) => {
    requireModuleContext(context, [MACRO_MODULE_KEY, RUNNER_MODULE_KEY], ['confluence:globalPage']);
    return getRuntimeMetadata();
  });
  resolver.define('analyzeBasicProgram', ({ payload, context }) => {
    requireConfluenceMacroContext(context);
    return analyzeBasicProgram(payload?.source);
  });
  resolver.define('prepareProgram', ({ payload, context }) => prepareProgram(payload, context));
  resolver.define('getPreparedProgram', ({ payload, context }) => getPreparedProgram(payload, context));
  resolver.define('getLatestPreparedProgram', ({ payload, context }) => getLatestPreparedProgram(payload, context));

  return resolver;
}

const resolver = createResolver();

module.exports = {
  MACRO_MODULE_KEY,
  RUNNER_MODULE_KEY,
  analyzeBasicProgram,
  getLatestPreparedProgram,
  getPreparedProgram,
  getRuntimeMetadata,
  prepareProgram,
  requireConfluenceMacroContext,
  requireConfluenceRunnerContext,
  requireLegacyMacroContext,
  setStorageForTests,
  handler: resolver ? resolver.getDefinitions() : {}
};
