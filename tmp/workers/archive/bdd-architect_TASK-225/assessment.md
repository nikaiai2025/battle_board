# TASK-225: フェーズ5検証 ダブルチェック結果

> 検証日: 2026-03-21
> 検証者: bdd-architect

---

## 1. APIテスト失敗

### GATE-FAIL-1: auth-cookie Max-Age不一致

**判定: テスト側の誤り（テスト修正が必要）**

根拠:
- 実装では全認証エンドポイントが365日で統一されている
  - `src/app/api/auth/auth-code/route.ts:167` — 365日 (コメント: 専ブラ bbs.cgi と統一)
  - `src/app/api/auth/login/route.ts:127` — 365日 (コメント: Web API・専ブラ統一)
  - `src/app/api/auth/callback/route.ts:118` — 365日
  - `src/app/api/threads/route.ts:176` — 365日
  - `src/app/api/threads/[threadId]/posts/route.ts:133` — 365日
  - `src/app/(senbra)/test/bbs.cgi/route.ts:583` — 365日 (コメント: eddist準拠)
- 全6箇所が365日で統一されており、設計意図は明確
- テスト (`e2e/api/auth-cookie.spec.ts:442`) のみが30日を期待しており、これが古い

対応方針: テストの期待値を `60 * 60 * 24 * 365` に修正する。1行のみの変更。

分類: 既存問題（テスト作成時の期待値誤り。Sprint 75-79の変更が原因ではない）

---

### GATE-FAIL-2/3: senbra-compat DB汚染

**判定: 妥当（テスト環境の問題）**

根拠:
- `senbra-compat.spec.ts` には `beforeEach` で `cleanupDatabase()` が正しく実装されている (L198-200)
- cleanup は posts, threads, edge_tokens テーブルを削除対象としている
- Playwright の設定上、`workers: 1` で直列実行のため、テスト間の並列競合は発生しない
- ゲート検証 (TASK-221) では `--project=e2e` を先に実行した後に `--project=api` を実行している。e2e テストのクリーンアップと api テストのクリーンアップは独立
- 考えられる失敗原因: `cleanupDatabase()` がSupabase REST API経由でDELETEしているが、Next.jsのサーバーサイド・データキャッシュ（fetch cache / ISR等）がstaleデータを返している可能性、またはSupabase REST APIのDELETEが非同期でコミット前にテストが進行した可能性

対応方針:
- 再現性を確認する（APIテスト単体実行 `npx playwright test --project=api` で再現するか確認）
- 再現しない場合はe2eプロジェクトとの実行順序に起因する一過性の問題として扱う
- 再現する場合は `cleanupDatabase()` にレスポンスステータスチェックを追加し、DELETE完了を保証する

分類: 既存問題（テスト基盤の問題。Sprint 75-79の変更が原因ではない）

---

## 2. コードレビューHIGH

### CODE-HIGH-001: hissi-handler 冗長2回DBクエリ

**判定: 妥当（改善推奨）**

根拠:
- `hissi-handler.ts:158-171` を実際に確認した
- L160-163: `findByAuthorIdAndDate(authorId, today)` — 全件取得（limitなし）
- L167-171: `findByAuthorIdAndDate(authorId, today, { limit: 3 })` — 最新3件取得
- 1回目で全件をメモリに取得済みであるため、2回目は `allPosts.slice(0, 3)` で代替可能
- `findByAuthorIdAndDate` は `created_at DESC` ソート済み（post-repository.ts:183で確認）のため、先頭3件が最新3件
- レビュー指摘通り `allPosts.slice(0, 3)` で1回のDBアクセスに削減できる

対応方針: L167-171を `const displayPosts = allPosts.slice(0, 3);` に置換する。影響範囲はhissi-handlerのみ。単体テストの修正は不要（findByAuthorIdAndDate のモック呼び出し回数をアサートしていなければ）。

分類: Sprint 75-79で導入された新コード

---

### CODE-HIGH-002: attack-handler 賠償金CreditReason誤用

**判定: 妥当（改善推奨）**

根拠:
- `attack-handler.ts:391-394` を実際に確認した。フローC（対象が人間の場合）の賠償金付与で `"bot_elimination"` を使用している
- `CreditReason` 型の定義 (`currency.ts:43-55`) を確認: `"compensation"` に相当する理由が存在しない
- 現在の `CreditReason` の候補は: incentive系(8種), `bot_elimination`, `initial_grant`, `incentive_thread_creation`, `admin_grant`
- `bot_elimination` は「ボット撃破報酬」の意味であり、「人間への誤攻撃に対する賠償金」とは意味が異なる
- 機能的な動作（通貨付与）自体は正常に行われるため、ユーザーに見える振る舞いへの影響はない
- ただし、監査ログ（通貨履歴）で「ボット撃破報酬」と「賠償金」が区別できなくなる

対応方針:
1. `CreditReason` に `"compensation"` を追加する
2. `attack-handler.ts:394` の `"bot_elimination"` を `"compensation"` に変更する
3. ドメインモデル (`currency.ts`) の変更を伴うが、型の union 追加のみで影響範囲は限定的
4. 対応する単体テスト (`attack-handler.test.ts`) のアサーション修正が必要

分類: Sprint 75-79で導入された新コード

---

## 3. ドキュメントレビューHIGH

### DOC-HIGH-001: thread-view.yaml route旧形式

**判定: 妥当（修正必要）**

根拠:
- `docs/specs/screens/thread-view.yaml:8` の `route` は `/threads/{threadId}` のまま
- BDDシナリオ `features/thread.feature @url_structure` では `/{boardId}/{threadKey}/` が正本
- 実装 (`src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx`) も `/{boardId}/{threadKey}/` に対応済み
- `back-to-list` (L31) の `href: /` も、BDDシナリオでは `/battleboard/` にリダイレクトされることが定義されている

対応方針:
- `route` を `/{boardId}/{threadKey}/` に更新
- `back-to-list.href` を `/{boardId}/` に更新

分類: 既存問題（Sprint 54前後のURL構造変更時にD-06が未更新だった）

---

### DOC-HIGH-002: thread-view.yaml post-number format矛盾

**判定: 妥当（修正必要）**

根拠:
- `thread-view.yaml:41` の `format: ">>{postNumber}"` はレス番号に `>>` を付与する定義
- BDDシナリオ (`thread.feature @post_number_display`) では「レス番号が "5" と表示される」「レス番号に ">>" は付与されない」と明示
- 実装 (`PostItem.tsx:273`) では `{post.postNumber}` を数字のみで表示（`>>` なし）
- BDD、実装が一致しており、D-06が古い

対応方針: `format` を `"{postNumber}"` に修正する

分類: 既存問題（D-06作成時からの不一致、またはBDD変更時にD-06が未更新）

---

### DOC-HIGH-003: thread-view.yaml command-helpコマンド欠落

**判定: 妥当（修正必要）**

根拠:
- `thread-view.yaml:132-135` には `!tell` と `!attack` の2コマンドのみ記載
- BDDシナリオで実装済みのコマンド:
  - `!tell` — `ai_accusation.feature` (記載あり)
  - `!attack` — `bot_system.feature` (記載あり)
  - `!w` — `reactions.feature` / `command_system.feature` (記載なし)
  - `!hissi` — `investigation.feature` (記載なし)
  - `!kinou` — `investigation.feature` (記載なし)
- `!w`, `!hissi`, `!kinou` が欠落している

対応方針:
- `command-help` の `content` に `!w >>N`, `!hissi >>N`, `!kinou >>N` を追加する

分類: Sprint 75-79で `!hissi`, `!kinou` が実装されたため、その時点で漏れた（`!w` は以前から欠落）

---

## サマリー

| ID | 判定 | 重要度 | Sprint 75-79起因 | 対応方針 |
|---|---|---|---|---|
| GATE-FAIL-1 | テスト側の誤り | HIGH | No | テスト期待値を365日に修正 |
| GATE-FAIL-2/3 | 妥当(テスト基盤) | HIGH | No | 再現性確認後に対応判断 |
| CODE-HIGH-001 | 妥当 | HIGH | Yes | `allPosts.slice(0, 3)` に置換 |
| CODE-HIGH-002 | 妥当 | HIGH | Yes | CreditReasonに `compensation` 追加 |
| DOC-HIGH-001 | 妥当 | HIGH | No | route, href更新 |
| DOC-HIGH-002 | 妥当 | HIGH | No | format修正 |
| DOC-HIGH-003 | 妥当 | HIGH | 部分的 | コマンド3件追記 |

誤検知: 0件
過剰指摘: 0件
妥当: 8件中8件

全指摘が妥当であり、レビューAIの精度は高い。
