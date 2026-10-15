// Run with `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inertMarkdown } from './replyMarkdown.ts';

test('fenced blocks leave the markdown, wherever they sit and even unclosed', () => {
	const { markdown, code } = inertMarkdown(
		['Run this:', '```dataviewjs', "require('child_process')", '```', '- ```js', '  a < b', '  ```', '> ~~~', '> x', '> ~~~', '```py', 'streaming…'].join('\n'),
	);
	assert.doesNotMatch(markdown, /```|~~~|child_process/);
	assert.deepEqual(code, [
		{ text: "require('child_process')", lang: 'dataviewjs' },
		{ text: 'a < b', lang: 'js' },
		{ text: 'x', lang: '' },
		{ text: 'streaming…', lang: 'py' },
	]);
});

test('inline code leaves the markdown; leftover backticks are escaped', () => {
	const { markdown, code } = inertMarkdown('Try `$=dv.current()` or ``a`b``, not ` this');
	assert.deepEqual(code, [{ text: '$=dv.current()' }, { text: 'a`b' }]);
	assert.doesNotMatch(markdown, /(?<!\\)`|\$=/);
});

test('images become links and HTML becomes text; escaped characters stay as they were', () => {
	const { markdown } = inertMarkdown('![x](https://e.example/p.png?q=1) ![[n]] <img src=x> <iframe> <!-- c --> \\![y](z) 1 < 2');
	assert.doesNotMatch(markdown, /(?<!\\)!\[|<[a-z!]/i);
	assert.match(markdown, /&#33;\[x\]\(https/);
	assert.match(markdown, /\\!\[y\]/);
	assert.match(markdown, /1 < 2/);
});
