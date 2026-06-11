import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const gamesDir = path.join(repoRoot, '101-BASIC-Computer-Games-v.1.0.2');
const outputPath = path.join(repoRoot, 'confluence', '101-basic-computer-games.storage.xml');
const firstEntryOutputPath = path.join(repoRoot, 'confluence', 'first-basic-computer-game.storage.xml');
const moduleOutputPath = path.join(repoRoot, 'src', 'games-page-data.js');
const extensionKey = '56be77c8-a94a-4580-a686-76856c812c75/65a2485d-b216-421d-a172-a6abefca842e/static/basic-m6502-macro';
const extensionId = `ari:cloud:ecosystem::extension/${extensionKey}`;
const extensionTitle = 'Microsoft 6502 BASIC (Development)';

function escapeXml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function normalizeSource(source) {
  return String(source || '').replace(/\r\n?/g, '\n').trimEnd();
}

function createMacroFragment(title, source) {
  const normalizedTitle = escapeXml(title);
  const macroBody = normalizeSource(source);
  return [
    `<h2>${normalizedTitle}</h2>`,
    '<ac:adf-extension>',
    '  <ac:adf-node type="extension">',
    `    <ac:adf-attribute key="extension-key">${escapeXml(extensionKey)}</ac:adf-attribute>`,
    '    <ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>',
    '    <ac:adf-attribute key="parameters">',
    `      <ac:adf-parameter key="local-id">${randomUuid()}</ac:adf-parameter>`,
    `      <ac:adf-parameter key="extension-id">${escapeXml(extensionId)}</ac:adf-parameter>`,
    `      <ac:adf-parameter key="extension-title">${escapeXml(extensionTitle)}</ac:adf-parameter>`,
    '      <ac:adf-parameter key="layout">extension</ac:adf-parameter>',
    '      <ac:adf-parameter key="forge-environment">DEVELOPMENT</ac:adf-parameter>',
    '      <ac:adf-parameter key="embedded-macro-context">',
    '        <ac:adf-parameter key="extension-data">',
    '          <ac:adf-parameter key="type">macro</ac:adf-parameter>',
    '        </ac:adf-parameter>',
    '      </ac:adf-parameter>',
    '    </ac:adf-attribute>',
    `    <ac:adf-attribute key="text">${normalizedTitle}</ac:adf-attribute>`,
    '    <ac:adf-attribute key="layout">default</ac:adf-attribute>',
    '  </ac:adf-node>',
    '  <ac:adf-fallback>',
    '    <ac:adf-node type="extension">',
      `      <ac:adf-attribute key="extension-key">${escapeXml(extensionKey)}</ac:adf-attribute>`,
    '      <ac:adf-attribute key="extension-type">com.atlassian.ecosystem</ac:adf-attribute>',
    '      <ac:adf-attribute key="parameters">',
    `        <ac:adf-parameter key="local-id">${randomUuid()}</ac:adf-parameter>`,
    `        <ac:adf-parameter key="extension-id">${escapeXml(extensionId)}</ac:adf-parameter>`,
    `        <ac:adf-parameter key="extension-title">${escapeXml(extensionTitle)}</ac:adf-parameter>`,
    '        <ac:adf-parameter key="layout">extension</ac:adf-parameter>',
    '        <ac:adf-parameter key="forge-environment">DEVELOPMENT</ac:adf-parameter>',
    '      </ac:adf-attribute>',
    `      <ac:adf-attribute key="text">${normalizedTitle}</ac:adf-attribute>`,
    '      <ac:adf-attribute key="layout">default</ac:adf-attribute>',
    '    </ac:adf-node>',
    '  </ac:adf-fallback>',
    '<ac:plain-text-body><![CDATA[',
    macroBody,
    ']]></ac:plain-text-body>',
    '</ac:adf-extension>',
  ].join('\n');
}

function randomUuid() {
  return crypto.randomUUID();
}

function renderPage(fragments, title = '101 BASIC Computer Games') {
  return [
    `<h1>${escapeXml(title)}</h1>`,
    '<p>This stub page is generated from the <code>101-BASIC-Computer-Games-v.1.0.2</code> directory. Each section is a BASIC macro body ready to prepare and run in the Confluence runner.</p>',
    '<ac:structured-macro ac:name="toc" />',
    ...fragments
  ].join('\n\n');
}

const files = fs.readdirSync(gamesDir)
  .filter((file) => file.toLowerCase().endsWith('.bas'))
  .sort((left, right) => left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' }));

const fragments = files.map((file) => {
  const source = fs.readFileSync(path.join(gamesDir, file), 'utf8');
  const title = file.replace(/\.bas$/i, '').toUpperCase();
  return createMacroFragment(title, source);
});

const firstGameTitle = files[0]?.replace(/\.bas$/i, '').toUpperCase() || '1CHECK';
const firstGameSource = files.length > 0
  ? fs.readFileSync(path.join(gamesDir, files[0]), 'utf8')
  : '';

const page = renderPage(fragments);
const firstEntryPage = renderPage([fragments[0]], '101 BASIC Computer Games - First Entry');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${page}\n`);
fs.writeFileSync(firstEntryOutputPath, `${firstEntryPage}\n`);
fs.writeFileSync(moduleOutputPath, [
  `export const BASIC_GAMES_PAGE_STORAGE_XML = ${JSON.stringify(`${page}\n`)};`,
  `export const BASIC_FIRST_GAME_PAGE_STORAGE_XML = ${JSON.stringify(`${firstEntryPage}\n`)};`,
  `export const BASIC_FIRST_GAME_TITLE = ${JSON.stringify(firstGameTitle)};`,
  `export const BASIC_FIRST_GAME_SOURCE = ${JSON.stringify(normalizeSource(firstGameSource))};`
].join('\n'));

console.log(`Wrote ${outputPath}, ${firstEntryOutputPath}, and ${moduleOutputPath} with ${files.length} BASIC macros.`);
