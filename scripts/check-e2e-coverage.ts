/**
 * E2E Navigation Test Coverage Check
 *
 * src/app/ 配下の全 page.tsx がナビゲーションテスト（e2e/smoke/）で
 * カバーされていることを検証する。
 *
 * 実行: npx tsx scripts/check-e2e-coverage.ts
 * 終了コード: 0 = 全カバー, 1 = 未カバーあり
 *
 * See: docs/architecture/bdd_test_strategy.md §10.2.5 増減基準
 */

import * as fs from "node:fs";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// 設定
// ---------------------------------------------------------------------------

const ROOT = process.cwd();
const APP_DIR = path.join(ROOT, "src/app");
const SMOKE_DIR = path.join(ROOT, "e2e/smoke");

/**
 * 意図的にナビゲーションテスト対象外とするルート。
 * 追加時は理由を必ず記載すること。
 */
const EXCLUDED_ROUTES: Record<string, string> = {
	// --- テスト未実装（実装タスク待ち） ---
	"/admin": "admin認証基盤未整備",
	"/admin/users": "admin認証基盤未整備",
	"/admin/users/[userId]": "admin認証基盤未整備",
	"/admin/ip-bans": "admin認証基盤未整備",
	"/dev": "テスト未実装",
	"/register/email": "テスト未実装",
	"/register/discord": "テスト未実装",
};

/**
 * 先頭セグメントが動的パラメータのルートに対する検索ヒント。
 * テストファイル内にこの文字列が含まれていればカバー済みと判定する。
 *
 * 先頭が静的セグメントのルート（例: /admin）にはヒント不要。
 * 静的プレフィックスで自動判定される。
 */
const DYNAMIC_ROUTE_HINTS: Record<string, string> = {
	"/[boardId]": "/battleboard",
	"/[boardId]/[threadKey]": "/battleboard/",
};

// ---------------------------------------------------------------------------
// page.tsx 列挙 → ルートパス変換
// ---------------------------------------------------------------------------

function findPageFiles(dir: string): string[] {
	const results: string[] = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			results.push(...findPageFiles(full));
		} else if (entry.name === "page.tsx") {
			results.push(full);
		}
	}
	return results;
}

/**
 * page.tsx のファイルパスを Next.js App Router のルートパスに変換する。
 *
 * 変換ルール:
 * 1. src/app/ からの相対パスを取得
 * 2. /page.tsx を除去
 * 3. ルートグループ (xxx) を除去
 * 4. オプショナルキャッチオール [[...param]] を除去
 * 5. 先頭に / を付与
 */
function toRoute(filePath: string): string {
	let rel = path.relative(APP_DIR, filePath).replace(/\\/g, "/");
	rel = rel.replace(/\/page\.tsx$/, "");
	if (rel === "page.tsx") return "/";
	// ルートグループ除去: (web)/ → 空
	rel = rel.replace(/\([^)]+\)\/?/g, "");
	// オプショナルキャッチオール除去
	rel = rel.replace(/\/?\[\[\.{3}[^\]]+\]\]/g, "");
	rel = rel.replace(/\/+$/, "");
	return "/" + rel;
}

// ---------------------------------------------------------------------------
// テストファイル読み込み
// ---------------------------------------------------------------------------

function loadSpecContents(dir: string): string {
	if (!fs.existsSync(dir)) return "";
	let combined = "";
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			combined += loadSpecContents(full);
		} else if (entry.name.endsWith(".spec.ts")) {
			combined += fs.readFileSync(full, "utf-8") + "\n";
		}
	}
	return combined;
}

// ---------------------------------------------------------------------------
// カバレッジ判定
// ---------------------------------------------------------------------------

/**
 * ルートからテストファイル内で検索する文字列を算出する。
 *
 * - ヒントが定義されている場合はヒントを返す
 * - 静的セグメントのみのルートはルートそのものを返す
 * - 動的セグメントを含む場合は最長の静的プレフィックス + "/" を返す
 * - 先頭が動的でヒントもない場合は null（判定不能 → 未カバー扱い）
 */
function getSearchKey(route: string): string | null {
	if (DYNAMIC_ROUTE_HINTS[route]) return DYNAMIC_ROUTE_HINTS[route];

	const segments = route.split("/").filter(Boolean);
	const staticSegments: string[] = [];
	for (const seg of segments) {
		if (seg.startsWith("[")) break;
		staticSegments.push(seg);
	}

	if (staticSegments.length === 0) return null;

	const prefix = "/" + staticSegments.join("/");
	const hasDynamic = segments.some((s) => s.startsWith("["));
	return hasDynamic ? prefix + "/" : prefix;
}

function isCovered(route: string, specContent: string): boolean {
	if (route === "/") {
		return (
			specContent.includes('page.goto("/")') ||
			specContent.includes("page.goto('/')")
		);
	}

	const searchKey = getSearchKey(route);
	if (searchKey === null) return false;
	return specContent.includes(searchKey);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------

const pageFiles = findPageFiles(APP_DIR);
const routes = pageFiles.map(toRoute).sort();
const specContent = loadSpecContents(SMOKE_DIR);

const covered: string[] = [];
const excluded: string[] = [];
const uncovered: string[] = [];

for (const route of routes) {
	if (EXCLUDED_ROUTES[route]) {
		excluded.push(route);
	} else if (isCovered(route, specContent)) {
		covered.push(route);
	} else {
		uncovered.push(route);
	}
}

// --- 出力 ---

console.log("=== E2E Navigation Test Coverage ===\n");
console.log(
	`Pages: ${routes.length} | Covered: ${covered.length} | Excluded: ${excluded.length} | Missing: ${uncovered.length}\n`,
);

for (const r of covered) {
	console.log(`  [OK]   ${r}`);
}
for (const r of excluded) {
	console.log(`  [SKIP] ${r} -- ${EXCLUDED_ROUTES[r]}`);
}
for (const r of uncovered) {
	console.log(`  [MISS] ${r}`);
}

console.log("");

if (uncovered.length > 0) {
	console.log(`FAIL: ${uncovered.length} page(s) missing navigation tests.`);
	console.log("See: docs/architecture/bdd_test_strategy.md §10.2.5");
	process.exit(1);
} else {
	console.log("PASS: All pages covered.");
}
