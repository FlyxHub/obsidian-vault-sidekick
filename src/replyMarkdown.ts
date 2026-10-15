/**
 * Claude's replies can repeat text planted in notes, web pages or connector results, so showing a reply
 * must not make it do anything. Obsidian's renderer would load remote images and HTML (a way to send
 * data out), and would hand code to other plugins (```dataviewjs runs JavaScript). inertMarkdown()
 * swaps every code block and span for a placeholder, turns images into links and escapes HTML; the
 * chat view puts the code back as plain text after the renderer and every plugin are done with it.
 */

/** A code block (lang set, maybe '') or an inline code span (lang undefined). */
export interface Code {
	text: string;
	lang?: string;
}

/** Private-use characters: plain text to Obsidian and to every plugin. */
export const MARK = /(\d+)/;
const mark = (i: number) => `${i}`;

// Over-matching only shows something as code; missing a fence would hand it to plugins. So the prefix
// takes any mix of indentation, quote and list markers.
const FENCE = /^([\s>*+\-.)\d]*?)(`{3,}|~{3,})(.*)$/;
const SPAN = /(?<!`)(`+)(?!`)([\s\S]*?[^`])\1(?!`)/g;

// ponytail: indented (4-space) code blocks still reach other plugins as <pre><code>; Claude fences its
// code, and a plugin would also need to act on unlabelled code. Convert them too if that changes.
export function inertMarkdown(md: string): { markdown: string; code: Code[] } {
	const code: Code[] = [];
	const out: string[] = [];
	let prose: string[] = [];
	const flush = () => {
		if (prose.length) out.push(inertProse(prose.join('\n'), code));
		prose = [];
	};
	const lines = md.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const open = FENCE.exec(lines[i]!);
		if (!open || (open[2]![0] === '`' && open[3]!.includes('`'))) {
			prose.push(lines[i]!); // a backtick fence's info string can't hold backticks: that's inline code
			continue;
		}
		const [, prefix, fence, info] = open as unknown as [string, string, string, string];
		const close = new RegExp(`^[\\s>]*${fence[0]}{${fence.length},}\\s*$`);
		const indent = new RegExp(`^ {0,${prefix.length}}`);
		const body: string[] = [];
		while (++i < lines.length && !close.test(lines[i]!)) {
			const line = lines[i]!;
			body.push(line.startsWith(prefix) ? line.slice(prefix.length) : line.replace(indent, ''));
		}
		flush();
		const n = code.push({ text: body.join('\n'), lang: /^[\w#+-]*/.exec(info.trim())![0] }) - 1;
		out.push(prefix ? prefix + mark(n) : `\n${mark(n)}\n`); // blank lines keep it out of a paragraph
	}
	flush();
	return { markdown: out.join('\n'), code };
}

function inertProse(text: string, code: Code[]): string {
	return (
		text
			.replace(SPAN, (_, _ticks, body: string) => mark(code.push({ text: body.replace(/\n/g, ' ').replace(/^ (.*[^ ].*) $/, '$1') }) - 1))
			// Images become links, HTML becomes text, stray backticks can't pair up into code.
			// An odd run of backslashes means the character is already escaped.
			.replace(/(\\*)(!\[|<(?=[a-z/!?])|`)/gi, (m, slashes: string, token: string) =>
				slashes.length % 2 ? m : slashes + (token === '![' ? '&#33;[' : token === '<' ? '&lt;' : '\\`'),
			)
	);
}
