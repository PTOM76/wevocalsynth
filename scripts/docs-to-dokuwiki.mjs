// docs/wiki/*.md と docs/VERSION.md を DokuWiki 記法へ変換して dist/dokuwiki/ に書き出す
// 使い方: node scripts/docs-to-dokuwiki.mjs [名前空間=wevocalsynth]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';

const NS = process.argv[2] ?? 'wevocalsynth';
const SRC = 'docs/wiki';
// wiki 以外から載せるページ
const EXTRA = ['docs/VERSION.md'];
// 画像は GitHub の raw URL を直接参照する
const IMAGE_URL = 'https://raw.githubusercontent.com/PTOM76/wevocalsynth/main/docs/images';
const OUT = 'dist/dokuwiki';

const sources = [...readdirSync(SRC).filter((f) => f.endsWith('.md')).map((f) => `${SRC}/${f}`), ...EXTRA];
const pageName = (file) => basename(file, '.md').toLowerCase();
const known = new Set(sources.map(pageName));

// 見出しの文字列 → DokuWiki のアンカー（近似）
const anchor = (s) => decodeURIComponent(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');

function inline(text) {
	// インラインコードを退避してから他を変換する
	const codes = [];
	text = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
	text = text.replace(/<br\s*\/?>/g, '\\\\ ');
	text = text.replace(/<img\s[^>]*>/g, (tag) => {
		const src = tag.match(/src="([^"]+)"/)?.[1] ?? '';
		const alt = tag.match(/alt="([^"]*)"/)?.[1];
		const w = tag.match(/width="(\d+)"/)?.[1];
		return `{{${IMAGE_URL}/${basename(src)}${w ? `?${w}` : ''}${alt ? `|${alt}` : ''}}}`;
	});
	text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, src) =>
		`{{${IMAGE_URL}/${basename(src)}${alt ? `|${alt}` : ''}}}`);
	text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
		if (/^https?:/.test(href)) return `[[${href}|${label}]]`;
		const [path, hash] = href.split('#');
		if (!path && hash) return `[[#${anchor(hash)}|${label}]]`;
		if (path.endsWith('.md') && known.has(pageName(path))) {
			return `[[${NS}:${pageName(path)}${hash ? `#${anchor(hash)}` : ''}|${label}]]`;
		}
		// wiki に載せないファイルへのリンクは文字だけ残す
		return label;
	});
	text = text.replace(/(^|[^*])\*([^*\s][^*]*?)\*(?!\*)/g, '$1//$2//');
	text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
	return text.replace(/\u0000(\d+)\u0000/g, (_, i) => `''%%${codes[i]}%%''`);
}

function convert(md) {
	const out = [];
	const lines = md.replace(/\r\n/g, '\n').split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const fence = line.match(/^\s*```(\w*)/);
		if (fence) {
			const body = [];
			while (++i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i]);
			out.push(`<code${fence[1] ? ` ${fence[1]}` : ''}>`, ...body, '</code>');
			continue;
		}
		// 折りたたみは folded プラグインの記法にする
		if (/^\s*<details[^>]*>\s*$/.test(line)) continue;
		const summary = line.match(/^\s*<summary>(.*)<\/summary>\s*$/);
		if (summary) {
			out.push(`++++ ${summary[1].replace(/<\/?b>/g, '')} |`);
			continue;
		}
		if (/^\s*<\/details>\s*$/.test(line)) {
			out.push('++++');
			continue;
		}
		const h = line.match(/^(#{1,5})\s+(.*)$/);
		if (h) {
			const eq = '='.repeat(7 - h[1].length);
			out.push(`${eq} ${h[2].trim()} ${eq}`);
			continue;
		}
		if (/^\s*\|/.test(line)) {
			const isSep = (l) => /^\s*\|?\s*:?-{2,}/.test(l);
			const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => inline(c.trim()));
			const header = isSep(lines[i + 1] ?? '');
			out.push(`${header ? '^' : '|'} ${cells(line).join(header ? ' ^ ' : ' | ')} ${header ? '^' : '|'}`);
			if (header) i++;
			continue;
		}
		const li = line.match(/^(\s*)([-*+]|\d+\.)\s+(.*)$/);
		if (li) {
			const depth = Math.floor(li[1].replace(/\t/g, '  ').length / 2) + 1;
			out.push(`${'  '.repeat(depth)}${/\d/.test(li[2]) ? '-' : '*'} ${inline(li[3])}`);
			continue;
		}
		const q = line.match(/^>\s?(.*)$/);
		if (q) {
			out.push(`> ${inline(q[1])}`);
			continue;
		}
		if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
			out.push('----');
			continue;
		}
		out.push(inline(line));
	}
	return out.join('\n');
}

rmSync(OUT, { recursive: true, force: true });
const pagesDir = join(OUT, 'pages', ...NS.split(':'));
mkdirSync(pagesDir, { recursive: true });

const manifest = [];
for (const src of sources) {
	const name = pageName(src);
	writeFileSync(join(pagesDir, `${name}.txt`), convert(readFileSync(src, 'utf8')));
	manifest.push({ id: `${NS}:${name}`, source: src, file: `pages/${NS.replace(/:/g, '/')}/${name}.txt` });
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, '\t'));
console.log(`${manifest.length} 件を ${OUT} に書き出した`);
