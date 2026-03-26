#!/usr/bin/env node
/**
 * copipe-seed.txt のバリデーションスクリプト
 *
 * 使い方: node scripts/validate-copipe-seed.mjs [ファイルパス]
 *   デフォルト: config/copipe-seed.txt
 *
 * チェック項目:
 *   - 区切り行の構文
 *   - タイトル重複
 *   - 空本文
 *   - ====END==== の存在
 */

import { readFileSync } from "fs";

const filePath = process.argv[2] || "config/copipe-seed.txt";

let raw;
try {
	raw = readFileSync(filePath, "utf-8");
} catch {
	console.error(`ファイルが読めません: ${filePath}`);
	process.exit(1);
}

const DELIMITER = /^====COPIPE:(.+?)====$/;
const END_MARKER = "====END====";

/** 前後の空行のみ除去。行内の先頭空白は保持する（AA の字下げ保護） */
function trimBlankLines(text) {
	return text.replace(/^(\s*\n)+/, "").replace(/(\n\s*)+$/, "");
}

const lines = raw.split("\n");
const entries = [];
const errors = [];
const names = new Map(); // name → line number

let current = null;

for (let i = 0; i < lines.length; i++) {
	const line = lines[i];
	const lineNum = i + 1;

	// ヘッダコメント（ファイル先頭の ## 行）をスキップ
	if (current === null && line.startsWith("##")) continue;

	// END マーカー
	if (line.trim() === END_MARKER) {
		if (current) {
			entries.push({ ...current, contentEnd: i });
			current = null;
		}
		break;
	}

	// 区切り行
	const match = line.match(DELIMITER);
	if (match) {
		// 前のエントリを閉じる
		if (current) {
			entries.push({ ...current, contentEnd: i });
		}

		const name = match[1].trim();

		// タイトル重複チェック
		if (names.has(name)) {
			errors.push(`行${lineNum}: タイトル "${name}" が重複しています（初出: 行${names.get(name)}）`);
		}
		names.set(name, lineNum);

		current = { name, contentStart: i + 1, lineNum };
		continue;
	}
}

// END マーカーなし
if (current) {
	errors.push(`====END==== が見つかりません（ファイル末尾に追加してください）`);
	entries.push({ ...current, contentEnd: lines.length });
}

// 各エントリの検証
for (const entry of entries) {
	const contentLines = lines.slice(entry.contentStart, entry.contentEnd);
	const content = trimBlankLines(contentLines.join("\n"));

	if (content.trim().length === 0) {
		errors.push(`行${entry.lineNum}: "${entry.name}" の本文が空です`);
	}

	entry.content = content;
	entry.lineCount = content.split("\n").length;
}

// レポート
console.log("=== copipe-seed.txt バリデーション結果 ===\n");
console.log(`ファイル: ${filePath}`);
console.log(`エントリ数: ${entries.length}`);

if (errors.length > 0) {
	console.log(`\nエラー: ${errors.length}件`);
	for (const err of errors) {
		console.log(`  ✗ ${err}`);
	}
} else {
	console.log("\nエラー: なし");
}

console.log("\n--- 登録一覧 ---");
for (const entry of entries) {
	const preview = entry.content.split("\n")[0].substring(0, 40);
	console.log(`  ${entry.name} (${entry.lineCount}行) — ${preview}...`);
}

if (errors.length > 0) {
	console.log(`\n結果: NG（${errors.length}件のエラーを修正してください）`);
	process.exit(1);
} else {
	console.log(`\n結果: OK（${entries.length}件のAA登録準備完了）`);
}
