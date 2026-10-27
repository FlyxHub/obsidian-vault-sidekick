// Run with `npm test` (Node 24 runs TypeScript directly).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { denyReason, vaultRelative } from './vaultPath.ts';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-test-'));
const vault = path.join(tmp, 'vault');
const outside = path.join(tmp, 'outside');
fs.mkdirSync(path.join(vault, 'Notes'), { recursive: true });
fs.mkdirSync(path.join(vault, '.obsidian'));
fs.mkdirSync(outside);
fs.writeFileSync(path.join(vault, 'Notes', 'a.md'), '# a');
fs.symlinkSync(outside, path.join(vault, 'escape'), 'junction'); // junction inside the vault pointing out
fs.symlinkSync(path.join(outside, 'missing'), path.join(vault, 'dangling'), 'junction'); // points out, at nothing yet

const deny = (tool: string, input: Record<string, unknown>) => denyReason(tool, input, vault, ['.obsidian', '.git', '.claude']);

void test('inside the vault is allowed', () => {
	assert.equal(deny('Read', { file_path: 'Notes/a.md' }), undefined);
	assert.equal(deny('Read', { file_path: path.join(vault, 'Notes', 'a.md') }), undefined);
	assert.equal(deny('Write', { file_path: path.join(vault, 'Notes', 'new', 'b.md') }), undefined);
	assert.equal(deny('Glob', { pattern: '**/*.md' }), undefined);
	assert.equal(deny('Grep', { pattern: '\\.\\./', path: 'Notes', glob: '*.md' }), undefined);
	assert.equal(deny('Read', { file_path: '.obsidian/app.json' }), undefined); // reading config is fine
	assert.equal(deny('Write', { file_path: '.obsidianx/a.md' }), undefined); // lookalike name isn't protected
	assert.equal(deny('mcp__github__get_file_contents', { path: '/README.md' }), undefined); // connector paths aren't local
});

void test('outside the vault is denied', () => {
	assert.ok(deny('Read', { file_path: path.join(outside, 'x.md') }));
	assert.ok(deny('Read', { file_path: '../outside/x.md' }));
	assert.ok(deny('Read', { file_path: '~/x.md' }));
	assert.ok(deny('Write', { file_path: 'escape/x.md' }));
	assert.ok(deny('Edit', { file_path: path.join(vault, 'escape', 'new', 'y.md') }));
	assert.ok(deny('Write', { file_path: 'dangling/x.md' }));
	assert.ok(deny('Glob', { pattern: '{..,x}/**/*.md' }));
	assert.ok(deny('Grep', { pattern: 'x', path: os.homedir() }));
	assert.ok(deny('Glob', { pattern: '../**/*.md' }));
	assert.ok(deny('Glob', { pattern: 'C:/Users/**' }));
	assert.ok(deny('Glob', { pattern: '/etc/*' }));
	assert.ok(deny('Grep', { pattern: 'x', glob: '..\\*.md' }));
});

void test('writes to protected folders are denied', () => {
	assert.ok(deny('Edit', { file_path: '.obsidian/app.json' }));
	assert.ok(deny('Write', { file_path: path.join(vault, '.git', 'config') }));
	assert.ok(deny('Write', { file_path: '.claude/settings.json' }));
	assert.ok(deny('Write', { file_path: '.OBSIDIAN/app.json' }));
	assert.ok(deny('Write', { file_path: '.Claude/settings.json' })); // not there yet, so no real case to resolve to
});

// NTFS stream syntax and trailing dots/spaces name the same folder only on Windows.
void test('Windows aliases of protected folders are denied', { skip: process.platform !== 'win32' }, () => {
	assert.ok(deny('Write', { file_path: '.git::$INDEX_ALLOCATION/config' }));
	assert.ok(deny('Write', { file_path: '.claude./settings.json' }));
	assert.ok(deny('Write', { file_path: '.obsidian /app.json' }));
	assert.ok(deny('Write', { file_path: 'Notes/a.md:hidden' }));
});

// UNC paths are Windows-only; on Linux '\' is a filename character and '//' is just '/'.
void test('network paths outside the vault are denied without being looked up', { skip: process.platform !== 'win32' }, () => {
	const real = fs.realpathSync.native;
	const looked: string[] = [];
	fs.realpathSync.native = ((p: string) => (looked.push(p), real(p))) as typeof real;
	try {
		assert.ok(deny('Write', { file_path: '//leak.invalid/share/x.md' }));
		assert.ok(deny('Read', { file_path: '\\\\?\\UNC\\leak.invalid\\share\\x.md' }));
	} finally {
		fs.realpathSync.native = real;
	}
	assert.deepEqual(looked.filter((p) => p.includes('leak.invalid')), []);
});

void test('vaultRelative normalizes separators and case', () => {
	assert.equal(vaultRelative(path.join(vault, 'Notes', 'a.md'), vault), 'Notes/a.md');
	assert.equal(vaultRelative(path.join(outside, 'x.md'), vault), undefined);
	// Backslash separators and case-insensitive paths are Windows-only; on Linux '\' is a filename character.
	if (process.platform === 'win32') {
		assert.equal(vaultRelative('Notes\\new.md', vault), 'Notes/new.md');
		assert.equal(vaultRelative(path.join(vault.toUpperCase(), 'NOTES', 'A.MD'), vault), 'Notes/a.md');
	}
});
