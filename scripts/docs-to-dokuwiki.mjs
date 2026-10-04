// docs/*.md を DokuWiki 記法へ変換して dist/dokuwiki/ に書き出す
// 使い方: node scripts/docs-to-dokuwiki.mjs [名前空間=wevocalsynth]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, rmSync } from 'node:fs';
import { join, basename } from 'node:path';

const NS = process.argv[2] ?? 'wevocalsynth';
const SRC = 'docs';
const OUT = 'dist/dokuwiki';
const MEDIA_NS = `${NS}:images`;

// ファイル名 → ページ ID（README は名前空間の start）
const pageId = (file) => {
	const name = basename(file, '.md').toLowerCase();
	return `${NS}:${name === 'readme' ? 'start' : name}`;
};

// 見出しの文字列 → DokuWiki のアンカー（近似）
const anchor = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_|_$/g, '');

function inline(text) {
	// インラインコードを退避してから他を変換する
	const codes = [];
	text = text.replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
	text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_, alt, src) => {
		const file = src.replace(/^\.?\/?images\//, '');
		return `{{${MEDIA_NS}:${file}${alt ? `|${alt}` : ''}}}`;
	});
	text = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, href) => {
		if (/^https?:/.test(href)) return `[[${href}|${label}]]`;
		const [path, hash] = href.split('#');
		if (path.endsWith('.md') && !path.includes('/')) {
			return `[[${pageId(path)}${hash ? `#${anchor(hash)}` : ''}|${label}]]`;
		}
		if (!path && hash) return `[[#${anchor(hash)}|${label}]]`;
		// リポジトリ内の他のファイルは GitHub への外部リンクに直さず文字だけ残す
		return `${label}（''${href}''）`;
	});
	text = text.replace(/\*\*(.+?)\*\*/g, '**$1**');
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
const mediaDir = join(OUT, 'media', ...MEDIA_NS.split(':'));
mkdirSync(pagesDir, { recursive: true });
mkdirSync(mediaDir, { recursive: true });

const manifest = [];
for (const f of readdirSync(SRC).filter((f) => f.endsWith('.md'))) {
	const id = pageId(f);
	const text = convert(readFileSync(join(SRC, f), 'utf8'));
	writeFileSync(join(pagesDir, `${id.split(':').pop()}.txt`), text);
	manifest.push({ id, source: `${SRC}/${f}`, file: `pages/${id.replace(/:/g, '/')}.txt` });
}
for (const f of readdirSync(join(SRC, 'images'))) {
	copyFileSync(join(SRC, 'images', f), join(mediaDir, f));
	manifest.push({ id: `${MEDIA_NS}:${f}`, source: `${SRC}/images/${f}`, file: `media/${MEDIA_NS.replace(/:/g, '/')}/${f}` });
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, '\t'));
console.log(`${manifest.length} 件を ${OUT} に書き出した`);
