# ドキュメント整合性レビューレポート (TASK-230)

> 対象: Sprint-80 差し戻し修正の再検証 (D-06 thread-view.yaml HIGH 3件)
> 前回レビュー: TASK-223 (Sprint 75-79)
> レビュー日: 2026-03-22
> レビュアー: bdd-doc-reviewer

---

## 再検証: 前回 HIGH 指摘の修正状況

### [HIGH-001] route 旧形式 -- **RESOLVED**

**修正前:** `route: /threads/{threadId}`, `back-to-list.href: /`
**修正後:** `route: /{boardId}/{threadKey}/[[...range]]`, `back-to-list.href: /{boardId}/`

**検証結果:**

| 照合先 | 整合性 |
|---|---|
| thread.feature `@url_structure` "/{boardId}/{threadKey}/" | 一致 |
| App Router パス `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` | 一致 |
| 実装 `back-to-list` href=`` `/${boardId}/` `` (page.tsx L280) | 一致 |
| thread.feature `@url_structure` "板URLでスレッド一覧が直接表示される" | 一致 |

route に `[[...range]]` (Optional Catch-all) を含む形式になっており、BDDシナリオ `@pagination` の範囲指定 URL (`/{boardId}/{threadKey}/1-100`) やデフォルト表示 (`/{boardId}/{threadKey}/`) の両方をカバーする正確な記述である。

---

### [HIGH-002] post-number format 矛盾 -- **RESOLVED**

**修正前:** `format: ">>{postNumber}"`
**修正後:** `format: "{postNumber}"`

**検証結果:**

| 照合先 | 整合性 |
|---|---|
| thread.feature `@post_number_display` "レス番号が '5' と表示される" | 一致 |
| thread.feature `@post_number_display` "レス番号に '>>' は付与されない" | 一致 |
| PostItem.tsx L273 `{post.postNumber}` (数字のみ出力) | 一致 |
| PostItem.tsx L14 コメント "レス番号はクリック可能なボタン(>>なし、数字のみ)" | 一致 |

`>>` は返信記法 (`>>5` を書き込みフォームに挿入するクリック動作) でのみ使用され、レス番号の表示には含まれない。D-06 の format 定義が BDD およびコードと完全に一致している。

---

### [HIGH-003] command-help コマンド欠落 -- **PARTIALLY RESOLVED (新規 MEDIUM 検出)**

**修正前:** `!tell`, `!attack` の 2 コマンドのみ
**修正後:** `!tell`, `!attack`, `!w`, `!hissi`, `!kinou` の 5 コマンド

コマンド数は正しく追加された。`abeshinzo` (hidden=true) が除外されているのもコマンドヘルプの設計意図に合致する。

しかし、追加された `!w` の説明文が正本と不一致:

| 項目 | D-06 thread-view.yaml (修正後) | config/commands.yaml (正本) | reactions.feature (BDD) |
|---|---|---|---|
| `!w` | "今日の草履歴（指定レスの投稿者の当日書き込み一覧）" | "指定レスに草を生やす" | "面白いと思ったレスに '!w' で草を生やしたい" |

D-06 の `!w` 説明文は `!hissi` の機能（対象ユーザーの当日書き込み一覧）と混同されている。この記述に従って UI のヘルプテキストを実装すると、ユーザーに誤った機能説明が表示される。

---

## 新規指摘事項

### [MEDIUM-005] D-06 thread-view.yaml: `!w` コマンドの説明文が BDD/config 正本と不一致

**対象ファイル:** `docs/specs/screens/thread-view.yaml` (L136)

**事象:**
command-help 要素の `!w` 説明文が「今日の草履歴（指定レスの投稿者の当日書き込み一覧）」となっている。これは reactions.feature および config/commands.yaml の定義「指定レスに草を生やす」と異なる。「当日書き込み一覧」は `!hissi` の機能であり、`!w` と `!hissi` の説明が混同されている。

**推奨対応:**
```yaml
# 修正案
- !w >>N -- 指定レスに草を生やす（無料リアクション）
```

---

## 前回 MEDIUM/LOW 指摘のステータス (参考)

以下は Sprint-80 の修正スコープ外であり、ステータスに変化なし。次回スプリントで対応予定。

| ID | 内容 | ステータス |
|---|---|---|
| MEDIUM-001 | D-02 荒らし役ボット体数 1体 vs 10体 | 未修正 (残存) |
| MEDIUM-002 | D-06 撃破済みBOT表示トグル要素定義欠落 | 未修正 (残存) |
| MEDIUM-003 | PostService postId 空文字プレースホルダ (LL-011) | 未修正 (残存) |
| MEDIUM-004 | D-08 web-ui.md ネスト構造不一致 | 未修正 (残存) |
| LOW-001 | D-10 auth.ts ヘルパー未記載 | 未修正 (残存) |

---

## 検証結果サマリ

### D-06 thread-view.yaml 修正の正確性

| 修正対象 | 照合結果 | 判定 |
|---|---|---|
| HIGH-001: route + back-to-list.href | BDD / App Router / 実装コードと完全一致 | PASS |
| HIGH-002: post-number format | BDD / 実装コードと完全一致 | PASS |
| HIGH-003: command-help コマンド追加 | 5コマンド追加済み。ただし `!w` 説明文に誤り | WARN |

### ドキュメント間の整合性

| チェック項目 | 結果 |
|---|---|
| D-06 route と D-03 @url_structure の一致 | PASS |
| D-06 post-number format と D-03 @post_number_display の一致 | PASS |
| D-06 command-help と config/commands.yaml の一致 | WARN -- MEDIUM-005 (!w 説明文不一致) |

### ドキュメントとコードの整合性

| チェック項目 | 結果 |
|---|---|
| D-06 route と App Router ディレクトリ構造 | PASS |
| D-06 back-to-list.href と実装の Link href | PASS |
| D-06 post-number format と PostItem.tsx 出力 | PASS |
| D-06 command-help と config/commands.yaml + handler 実装 | WARN -- MEDIUM-005 |

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 0     | pass      |
| MEDIUM   | 1     | info      |
| LOW      | 0     | pass      |

判定: APPROVE -- 前回の HIGH 3件は修正済み。新規 MEDIUM 1件 (!w 説明文) は機能動作に影響しないため、承認可能。次回スプリントでの修正を推奨。

**注記:** 前回レポート (TASK-223) の MEDIUM 4件 + LOW 1件は Sprint-80 スコープ外のため残存している。これらは Sprint-80 の承認判定には含めない (今回の再検証スコープは HIGH 3件の修正確認)。
