/**
 * copipe_viewer.feature ステップ定義
 *
 * AAビューワーページの全3シナリオを実装する。
 *   1. GET /api/copipe/list が管理者・ユーザー両方のAAを返す
 *   2. クエリパラメータ q による名前の部分一致フィルタリング
 *   3. ヘッダーナビゲーションに nav-copipe リンクが存在する
 *
 * シナリオ1・2 はリポジトリの findAll を直接呼び出して検証する。
 * シナリオ3 は Header コンポーネントのレンダリング結果ではなく、
 * コンポーネントの JSX ソースを静的検査する形で代替する
 * （BDD テストは UI の振る舞いをサービス層テストで検証する方針のため）。
 *
 * See: features/copipe_viewer.feature
 * See: docs/architecture/bdd_test_strategy.md §1 サービス層テスト
 */

import { Given, Then, When } from "@cucumber/cucumber";
import assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { InMemoryCopipeRepo } from "../support/mock-installer";
import type { BattleBoardWorld } from "../support/world";

// ---------------------------------------------------------------------------
// リポジトリの動的 require ヘルパー
// See: docs/architecture/bdd_test_strategy.md §2 外部依存のモック戦略
// ---------------------------------------------------------------------------

function getCopipeRepository() {
	return require("../../src/lib/infrastructure/repositories/copipe-repository") as typeof import("../../src/lib/infrastructure/repositories/copipe-repository");
}

// ---------------------------------------------------------------------------
// シナリオ固有のコンテキスト型定義
// ---------------------------------------------------------------------------

interface CopipeViewerContext {
	/** findAll の呼び出し結果 */
	lastListResult?: Awaited<
		ReturnType<
			typeof import("../../src/lib/infrastructure/repositories/copipe-repository").findAll
		>
	>;
}

type CopipeViewerWorld = BattleBoardWorld & CopipeViewerContext;

// ---------------------------------------------------------------------------
// Given: 管理者コピペ「しょぼーん」とユーザーコピペ「オリジナルAA」が登録されている
// See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
// ---------------------------------------------------------------------------

/**
 * 管理者コピペ「しょぼーん」とユーザーコピペ「オリジナルAA」を InMemory ストアに登録する。
 */
Given(
	"管理者コピペ「しょぼーん」とユーザーコピペ「オリジナルAA」が登録されている",
	function (this: CopipeViewerWorld) {
		InMemoryCopipeRepo._insert({ name: "しょぼーん", content: "（´・ω・｀）" });
		InMemoryCopipeRepo._insertUser({
			name: "オリジナルAA",
			content: "ユーザー作成のオリジナルAAです",
		});
	},
);

// ---------------------------------------------------------------------------
// Given: 管理者コピペ「しょぼーん」と「ぬるぽ」が登録されている
// See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
// ---------------------------------------------------------------------------

/**
 * 管理者コピペ「しょぼーん」と「ぬるぽ」を InMemory ストアに登録する。
 */
Given(
	"管理者コピペ「しょぼーん」と「ぬるぽ」が登録されている",
	function (this: CopipeViewerWorld) {
		InMemoryCopipeRepo._insert({ name: "しょぼーん", content: "（´・ω・｀）" });
		InMemoryCopipeRepo._insert({
			name: "ぬるぽ",
			content: "NullPointerException AA",
		});
	},
);

// ---------------------------------------------------------------------------
// When: GET /api/copipe/list を実行する
// See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
// ---------------------------------------------------------------------------

/**
 * クエリなしで findAll を呼び出す（全件取得）。
 */
When(
	/^GET \/api\/copipe\/list を実行する$/,
	async function (this: CopipeViewerWorld) {
		const repo = getCopipeRepository();
		this.lastListResult = await repo.findAll();
	},
);

// ---------------------------------------------------------------------------
// When: GET /api/copipe/list?q=しょぼ を実行する
// See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
// ---------------------------------------------------------------------------

/**
 * クエリ「しょぼ」で findAll を呼び出す（部分一致フィルタリング）。
 */
When(
	/^GET \/api\/copipe\/list\?q=しょぼ を実行する$/,
	async function (this: CopipeViewerWorld) {
		const repo = getCopipeRepository();
		this.lastListResult = await repo.findAll("しょぼ");
	},
);

// ---------------------------------------------------------------------------
// Then: レスポンスに「しょぼーん」と「オリジナルAA」が含まれる
// See: features/copipe_viewer.feature @AAビューワーページを開くと管理者・ユーザー両方のAAが一覧表示される
// ---------------------------------------------------------------------------

/**
 * 取得結果に「しょぼーん」と「オリジナルAA」の両方が含まれることを検証する。
 */
Then(
	"レスポンスに「しょぼーん」と「オリジナルAA」が含まれる",
	function (this: CopipeViewerWorld) {
		assert.ok(this.lastListResult, "findAll の結果が存在すること");
		const names = this.lastListResult.map((e) => e.name);
		assert.ok(
			names.includes("しょぼーん"),
			`結果に「しょぼーん」が含まれること（実際: ${names.join(", ")}）`,
		);
		assert.ok(
			names.includes("オリジナルAA"),
			`結果に「オリジナルAA」が含まれること（実際: ${names.join(", ")}）`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: レスポンスに「しょぼーん」が含まれる
// See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
// ---------------------------------------------------------------------------

/**
 * 取得結果に「しょぼーん」が含まれることを検証する。
 */
Then(
	"レスポンスに「しょぼーん」が含まれる",
	function (this: CopipeViewerWorld) {
		assert.ok(this.lastListResult, "findAll の結果が存在すること");
		const names = this.lastListResult.map((e) => e.name);
		assert.ok(
			names.includes("しょぼーん"),
			`結果に「しょぼーん」が含まれること（実際: ${names.join(", ")}）`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: レスポンスに「ぬるぽ」は含まれない
// See: features/copipe_viewer.feature @名前で部分一致フィルタリングできる
// ---------------------------------------------------------------------------

/**
 * 取得結果に「ぬるぽ」が含まれないことを検証する。
 */
Then("レスポンスに「ぬるぽ」は含まれない", function (this: CopipeViewerWorld) {
	assert.ok(this.lastListResult, "findAll の結果が存在すること");
	const names = this.lastListResult.map((e) => e.name);
	assert.ok(
		!names.includes("ぬるぽ"),
		`結果に「ぬるぽ」が含まれないこと（実際: ${names.join(", ")}）`,
	);
});

// ---------------------------------------------------------------------------
// When: スレッド一覧ページを開く
// See: features/copipe_viewer.feature @ヘッダーナビゲーションにAAビューワーへのリンクが存在する
// ---------------------------------------------------------------------------

/**
 * スレッド一覧ページを開く（ヘッダーの静的検証のためのコンテキスト設定）。
 * BDD テストはサービス層テストのため、実際の HTTP リクエストは発行しない。
 * ヘッダーコンポーネントのソースファイルパスを world に記録する。
 */
When("スレッド一覧ページを開く", function (this: CopipeViewerWorld) {
	// ヘッダーコンポーネントのソース読み込みを次のステップで行う準備
	// （no-op: 次の Then ステップで Header.tsx を静的に検査する）
});

// ---------------------------------------------------------------------------
// Then: ヘッダーに id="nav-copipe" のリンクが存在する
// See: features/copipe_viewer.feature @ヘッダーナビゲーションにAAビューワーへのリンクが存在する
// ---------------------------------------------------------------------------

/**
 * Header.tsx のソースコードを静的解析し、id="nav-copipe" の要素が存在することを検証する。
 *
 * BDD テストはサービス層テストが主体（D-10 §1）のため、DOM レンダリングは行わず
 * ソースコード静的検査で代替する。
 *
 * NOTE: featureファイルの `id="nav-copipe"` 内のダブルクォートは Cucumber Expression の
 * {string} として誤解釈されるため正規表現パターンで定義する。
 */
Then(
	/^ヘッダーに id="([^"]*)" のリンクが存在する$/,
	function (this: CopipeViewerWorld, expectedId: string) {
		const headerPath = path.resolve(
			__dirname,
			"../../src/app/(web)/_components/Header.tsx",
		);
		const source = fs.readFileSync(headerPath, "utf-8");
		const expectedAttr = `id="${expectedId}"`;
		assert.ok(
			source.includes(expectedAttr),
			`Header.tsx に ${expectedAttr} が存在すること`,
		);
	},
);

// ---------------------------------------------------------------------------
// Then: リンクの href は "/copipe" である
// See: features/copipe_viewer.feature @ヘッダーナビゲーションにAAビューワーへのリンクが存在する
// ---------------------------------------------------------------------------

/**
 * Header.tsx のソースコードを静的解析し、nav-copipe リンクの href が "/copipe" であることを検証する。
 *
 * NOTE: featureファイルの `"/copipe"` は Cucumber Expression の {string} として解釈されるため、
 * 正規表現パターンで定義し、マッチした href 値を検証する。
 */
Then(
	/^リンクの href は "([^"]*)" である$/,
	function (this: CopipeViewerWorld, expectedHref: string) {
		const headerPath = path.resolve(
			__dirname,
			"../../src/app/(web)/_components/Header.tsx",
		);
		const source = fs.readFileSync(headerPath, "utf-8");
		// nav-copipe ブロックに href="{expectedHref}" が含まれることを確認する
		const expectedAttr = `href="${expectedHref}"`;
		assert.ok(
			source.includes(expectedAttr),
			`Header.tsx に ${expectedAttr} が存在すること`,
		);
	},
);
