/**
 * copipe_entries テーブルへの seed データ完全同期スクリプト
 *
 * 処理フロー:
 *   1. config/copipe-seed.txt を読み込む
 *   2. ====COPIPE:タイトル==== 区切りでパースし name + content のペアを抽出
 *   3. copipe_entries テーブルを seed.txt の内容に完全同期:
 *      - 新規 name → INSERT
 *      - 既存 name → content を UPDATE
 *      - seed.txt にない name → DELETE
 *
 * seed.txt が唯一の正本。DB は毎回この内容に一致させる。
 *
 * 実行方法:
 *   npx tsx scripts/seed-copipe.ts
 *
 * 環境変数:
 *   SUPABASE_URL              — Supabase プロジェクトURL
 *   SUPABASE_SERVICE_ROLE_KEY — サービスロールキー（RLS バイパス用）
 *
 * See: features/command_copipe.feature
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// 型定義
// ---------------------------------------------------------------------------

interface CopipeEntry {
	name: string;
	content: string;
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

/** 区切り行のパターン: ====COPIPE:タイトル==== */
const DELIMITER = /^====COPIPE:(.+?)====$/;

/** 終端マーカー */
const END_MARKER = "====END====";

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------

/** 前後の空行のみ除去。行内の先頭空白は保持する（AA の字下げ保護） */
function trimBlankLines(text: string): string {
	return text.replace(/^(\s*\n)+/, "").replace(/(\n\s*)+$/, "");
}

// ---------------------------------------------------------------------------
// パース処理
// ---------------------------------------------------------------------------

/**
 * copipe-seed.txt を読み込み、エントリ一覧を返す。
 * - ファイル先頭の ## コメント行はスキップ
 * - ====COPIPE:タイトル==== 区切りで本文を抽出
 * - 本文の前後空行はトリム、本文中の空行は保持
 * - ====END==== 以降は無視
 *
 * See: features/command_copipe.feature
 */
function parseCopipeSeed(filePath: string): CopipeEntry[] {
	const raw = fs.readFileSync(filePath, "utf-8");
	const lines = raw.split(/\r?\n/);

	const entries: CopipeEntry[] = [];
	let currentName: string | null = null;
	let currentContentStart = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];

		// ヘッダコメント（ファイル先頭の ## 行）をスキップ
		if (currentName === null && line.startsWith("##")) continue;

		// END マーカー: それ以降は処理しない
		if (line.trim() === END_MARKER) {
			if (currentName !== null) {
				const contentLines = lines.slice(currentContentStart, i);
				const content = trimBlankLines(contentLines.join("\n"));
				entries.push({ name: currentName, content });
				currentName = null;
			}
			break;
		}

		// 区切り行: 新しいエントリの開始
		const match = line.match(DELIMITER);
		if (match) {
			// 前のエントリを閉じる
			if (currentName !== null) {
				const contentLines = lines.slice(currentContentStart, i);
				const content = trimBlankLines(contentLines.join("\n"));
				entries.push({ name: currentName, content });
			}

			currentName = match[1].trim();
			currentContentStart = i + 1;
		}
	}

	return entries;
}

// ---------------------------------------------------------------------------
// メイン処理
// ---------------------------------------------------------------------------

/**
 * copipe_entries テーブルを seed.txt の内容に完全同期する。
 * seed.txt が正本: 追加・更新・削除すべてを反映する。
 */
async function main(): Promise<void> {
	const { createClient } = await import("@supabase/supabase-js");

	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		throw new Error(
			"SUPABASE_URL または SUPABASE_SERVICE_ROLE_KEY が設定されていません",
		);
	}

	const supabase = createClient(supabaseUrl, supabaseServiceKey);

	// seed ファイルをパース
	const seedPath = path.resolve(process.cwd(), "config", "copipe-seed.txt");
	console.log(`[seed-copipe] seed ファイルを読み込み中: ${seedPath}`);
	const entries = parseCopipeSeed(seedPath);
	console.log(`[seed-copipe] パース完了: ${entries.length} 件のエントリ`);

	if (entries.length === 0) {
		console.log("[seed-copipe] seed が空です。全エントリを削除します");
		const { error } = await supabase
			.from("copipe_entries")
			.delete()
			.neq("id", 0); // 全行削除（neq で WHERE TRUE 相当）
		if (error) throw new Error(`全削除エラー: ${error.message}`);
		console.log("[seed-copipe] 全エントリ削除完了");
		return;
	}

	// Step 1: UPSERT — 新規は INSERT、既存は content を UPDATE
	console.log("[seed-copipe] UPSERT 中...");
	const { error: upsertError } = await supabase.from("copipe_entries").upsert(
		entries.map((e) => ({ name: e.name, content: e.content })),
		{ onConflict: "name" },
	);

	if (upsertError) {
		throw new Error(`UPSERT エラー: ${upsertError.message}`);
	}

	// Step 2: DELETE — seed.txt にない name を削除
	const seedNames = entries.map((e) => e.name);

	// DB 上の全 name を取得
	const { data: dbEntries, error: selectError } = await supabase
		.from("copipe_entries")
		.select("name");

	if (selectError) {
		throw new Error(`SELECT エラー: ${selectError.message}`);
	}

	const toDelete = (dbEntries ?? [])
		.map((row: { name: string }) => row.name)
		.filter((name: string) => !seedNames.includes(name));

	if (toDelete.length > 0) {
		const { error: deleteError } = await supabase
			.from("copipe_entries")
			.delete()
			.in("name", toDelete);

		if (deleteError) {
			throw new Error(`DELETE エラー: ${deleteError.message}`);
		}
	}

	// 結果表示
	console.log("[seed-copipe] 同期完了");
	console.log(`  seed エントリ数: ${entries.length}`);
	console.log(`  削除: ${toDelete.length} 件`);
	if (toDelete.length > 0) {
		for (const name of toDelete) {
			console.log(`    [DELETE] ${name}`);
		}
	}
	for (const entry of entries) {
		console.log(`  [SYNC] ${entry.name}`);
	}
}

// スクリプトとして直接実行された場合のみ main() を呼ぶ
if (process.argv[1] && process.argv[1].includes("seed-copipe")) {
	main().catch((err) => {
		console.error("[seed-copipe] エラー:", err);
		process.exit(1);
	});
}

// テスト用エクスポート
export { parseCopipeSeed };
