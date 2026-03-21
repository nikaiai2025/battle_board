# ドキュメント整合性レビューレポート (TASK-223)

> 対象: Sprint 75-79 のドキュメント整合性
> レビュー日: 2026-03-21
> レビュアー: bdd-doc-reviewer

---

## 指摘事項

### [HIGH-001] D-06 thread-view.yaml: ルート定義が旧形式のまま

**対象ファイル:** `docs/specs/screens/thread-view.yaml` (L8, L31)

**事象:**
画面要素定義書 SCR-002 の `route` が `/threads/{threadId}` のままになっている。thread.feature の `@url_structure` シナリオおよび D-08 web-ui.md で URL 構造が `/{boardId}/{threadKey}/` に変更済みであり、画面要素定義書が追従していない。

同様に、`back-to-list` リンクの `href` が `/` のままだが、thread.feature では `/battleboard/` に遷移する仕様（「ルートURLが板トップにリダイレクトされる」）。D-08 web-ui.md でも板パス付きリンク (`/{boardId}/`) が正本。

**影響:** D-06 を参照する実装者が旧URLでコーディングするリスクがある。CLAUDE.md の「仕様変更の伝播ルール」に対する違反（D-03/D-08変更時にD-06を連動更新していない）。

**推奨対応:**
- `route` を `/{boardId}/{threadKey}/` に更新
- `back-to-list.href` を `/{boardId}/` に更新

---

### [HIGH-002] D-06 thread-view.yaml: post-number の format が BDD と矛盾

**対象ファイル:** `docs/specs/screens/thread-view.yaml` (L41)

**事象:**
`post-number` の `format` が `">>{postNumber}"` と定義されている。しかし thread.feature `@post_number_display` シナリオには明確に以下の記述がある:

> レス番号が "5" と表示される
> レス番号に ">>" は付与されない

BDD シナリオはレス番号の一覧表示に `>>` を付けないことを明示的に定義しており、D-06 の format 定義と矛盾している。

**影響:** D-06 の format に従って実装するとBDDシナリオが失敗する。仕様正本の優先順位（BDD > D-06）に基づき、D-06 側を修正する必要がある。

**推奨対応:**
- `format` を `"{postNumber}"` に修正し、`>>` を除去する

---

### [HIGH-003] D-06 thread-view.yaml: command-help のコマンド一覧が不完全

**対象ファイル:** `docs/specs/screens/thread-view.yaml` (L127-136)

**事象:**
`command-help` 要素のコマンド一覧に `!tell` と `!attack` の2コマンドしか記載されていない。しかし D-08 command.md の `config/commands.yaml` 定義および investigation.feature / reactions.feature では以下のコマンドが実装済み:

| コマンド | 実装元 | D-06 記載 |
|---|---|---|
| `!tell` | ai_accusation.feature | あり |
| `!attack` | bot_system.feature | あり |
| `!w` | reactions.feature | **なし** |
| `!hissi` | investigation.feature | **なし** |
| `!kinou` | investigation.feature | **なし** |

**影響:** ユーザーが利用可能なコマンドの一部を発見できない。ヘルプ表示がコマンド実装の追加に追従していない。

**推奨対応:**
- `!w >>N` (草を生やす)、`!hissi >>N` (必死チェッカー)、`!kinou >>N` (昨日のID) を追加
- 将来のコマンド追加に備え、`config/commands.yaml` から動的生成する方針への変更も検討

---

### [MEDIUM-001] D-02 ユビキタス言語辞書: 荒らし役ボットの体数が D-03/D-05 と不一致

**対象ファイル:** `docs/requirements/ubiquitous_language.yaml` (L318)

**事象:**
ユビキタス言語辞書の「運営ボット」定義に「Phase 2では荒らし役(チュートリアルMob)を**1体**実装」と記載されている。一方:
- bot_system.feature (D-03): 「荒らし役ボットは**10体**が並行して活動する」
- bot_state_transitions.yaml (D-05): `count: 10`, 「10体が並行稼働」

D-02 の記述がBDDシナリオ (D-03) および状態遷移仕様書 (D-05) の最新定義に追従していない。

**推奨対応:**
- D-02 の運営ボット定義を「Phase 2では荒らし役(チュートリアルMob)を**10体**実装」に更新

---

### [MEDIUM-002] D-06 thread-view.yaml: 撃破済みBOT表示トグルの画面要素定義が欠落

**対象ファイル:** `docs/specs/screens/thread-view.yaml`

**事象:**
bot_system.feature には以下のシナリオが存在する:
- 「撃破済みボットのレスはWebブラウザで目立たない表示になる」
- 「撃破済みボットのレス表示をトグルで切り替えられる」

これらに対応する画面要素（トグルボタン、撃破済みボットのスタイル定義）が D-06 SCR-002 に定義されていない。E2E テスト (`e2e/flows/bot-display.spec.ts`) は `test.fixme()` でスキップ中であり、UI実装は未完了と推察されるが、D-06 への要素定義は先行して行うべきである。

**推奨対応:**
- 「撃破済みBOTレス表示トグル」と「撃破済みBOT用スタイル」の要素定義を SCR-002 に追加

---

### [MEDIUM-003] PostService: postId 空文字プレースホルダが残存 (LL-011 是正不完全)

**対象ファイル:** `src/lib/services/post-service.ts` (L429), `src/lib/services/command-service.ts` (L103)

**事象:**
LL-011 で「UUID列に到達し得るフィールドにプレースホルダ空文字列を使わない」と教訓化された。実害は以下の対処で回避済み:
- `attack-repository.ts` の `post_id` が nullable 化 (`00020_attacks_post_id_nullable.sql`)
- `attack-handler.ts` (L289) で `ctx.postId || null` 変換を実施

しかし、根本的な是正が未完了:
1. PostService (L429) で `postId: ""` が渡されている
2. `CommandContext.postId` の型が `string` のまま (`command-service.ts` L103) であり、LL-011 が推奨する `string | null` になっていない
3. 他のハンドラが将来的に `ctx.postId` をDB操作に使用した場合に同様の問題が再発し得る

**推奨対応:**
- `CommandContext.postId` を `string | null` に変更
- PostService で `postId: null` を渡す
- LL-011 の教訓をコードレベルで完全に適用する

---

### [MEDIUM-004] D-08 web-ui.md (前回 MEDIUM-NEW-001): コンポーネントツリーのネスト構造の不一致が未修正

**対象ファイル:** `docs/architecture/components/web-ui.md` (L82-94)

**事象:**
前回レビュー (TASK-182) で指摘した MEDIUM-NEW-001 が未修正のまま残存している。D-08 web-ui.md section 3.2 では `AnchorPopupProvider` と `PostFormContextProvider` が兄弟関係として記述されているが、実装では `AnchorPopupProvider` が `PostFormContextProvider` を包含する親要素になっている。

実装のネスト構造は正しい（React の Context 伝播の要件による）。ドキュメントの記述が実装と乖離している。

**推奨対応:**
- 前回レビューで提示した修正方針に従い、section 3.2 のツリー表記を実装のネスト構造に合わせる

---

### [LOW-001] D-10 bdd_test_strategy.md: ファイル構成記載に auth.ts ヘルパーが未記載

**対象ファイル:** `docs/architecture/bdd_test_strategy.md` (L410-425)

**事象:**
D-10 の 10.3.3 項で定義された E2E ファイル構成に `e2e/helpers/auth.ts` が記載されていない。実際のファイルシステムでは `e2e/helpers/auth.ts` と `e2e/helpers/turnstile.ts` の両方が存在するが、D-10 には `turnstile.ts` のみ記載。

**推奨対応:**
- D-10 のファイル構成に `auth.ts` を追加

---

## 検証結果サマリ

### ドキュメント間の整合性

| チェック項目 | 結果 |
|---|---|
| CLAUDE.md 記載の成果物ファイルの存在確認 | PASS -- レビュー対象の全ドキュメントが存在 |
| 用語のユビキタス言語辞書準拠 | WARN -- MEDIUM-001 (荒らし役の体数 1体 vs 10体) |
| BDDシナリオの状態名と D-05 の一致 | PASS -- lurking/revealed/eliminated が一致 |
| OpenAPI エンドポイントと BDD シナリオの対応 | PASS -- createPost のレスポンスに botMark/commandResult/inlineSystemInfo が定義済み |
| D-05 禁止遷移の BDD シナリオ検証 | PASS -- 撃破済みボットへの攻撃拒否、同日2回目拒否、自己攻撃拒否、システムメッセージ拒否が網羅 |

### ドキュメントとコードの整合性

| チェック項目 | 結果 |
|---|---|
| BDD シナリオの HTTP ステータス / エラーコードの OpenAPI 定義 | PASS -- 400/401/404 が定義済み |
| 実装コードと D-07/D-08 の乖離 | WARN -- MEDIUM-003 (LL-011 是正不完全), MEDIUM-004 (ネスト構造不一致) |
| D-06 と D-03/D-08 の整合性 | FAIL -- HIGH-001/002/003 (D-06 の陳腐化) |

### テストコードの網羅性

| チェック項目 | 結果 |
|---|---|
| BDD シナリオのテストデータ / 前提条件のステップ定義実装 | PASS -- @image_preview 含め全ステップ実装済み |
| D-10 のテスト構成と実際のディレクトリ / ファイル命名 | INFO -- LOW-001 (helpers/auth.ts 未記載) |

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 3     | warn      |
| MEDIUM   | 4     | info      |
| LOW      | 1     | note      |

判定: WARNING -- マージ前に3件のHIGH(重要)な問題を解決してください。

**HIGH 3件はいずれも D-06 thread-view.yaml の陳腐化に起因します。** BDDシナリオ (D-03) と D-08 web-ui.md は Sprint 75-79 の変更に追従していますが、D-06 画面要素定義書の更新が漏れています。CLAUDE.md の「仕様変更の伝播ルール」(BDD > 外部仕様 > 内部仕様 > 実装) に基づき、D-03/D-08 の変更に連動して D-06 を同期更新する必要があります。
