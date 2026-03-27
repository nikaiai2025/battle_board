# ドキュメントレビューレポート: DOCREVIEW-135

> Sprint-135 対象 | レビュー実施日: 2026-03-28 | レビュアー: bdd-doc-reviewer

---

## 1. レビュー対象

Sprint-135 計画書 (`tmp/orchestrator/sprint_135_plan.md`) に記載された4タスクの変更内容と、関連ドキュメント群の整合性を検証した。

| TASK_ID | 内容 |
|---|---|
| TASK-345 | ボット日次リセット インカーネーションモデル化 |
| TASK-346 | `!w` 同日制限撤廃（reactions.feature v5対応） |
| TASK-347 | 範囲攻撃BDDステップ定義実装（9シナリオ） |
| TASK-348 | FAB BDDステップ定義 pending化 + FloatingActionMenu Vitestテスト |

---

## 2. 検出事項

### [MEDIUM-1] OpenAPI仕様書にPKCE Cookie (`bb-pkce-state`) の記述がない

**対象ファイル**: `docs/specs/openapi.yaml` (L402-450, L515-550)

**概要**: Sprint-135 で Discord OAuth の PKCE フロー（手動PKCE + Cookie保持方式）が実装された。`/api/auth/login/discord` および `/api/auth/register/discord` のレスポンスで `Set-Cookie: bb-pkce-state` が設定され、`/api/auth/callback` でそのCookieが読み取られて削除される。しかし OpenAPI 仕様書の当該エンドポイント定義には `Set-Cookie` ヘッダの記述が存在しない。

- `POST /api/auth/login/discord`: 200 レスポンスに `Set-Cookie: bb-pkce-state` が欠落
- `POST /api/auth/register/discord`: 同上
- `GET /api/auth/callback`: 302 レスポンスの `Set-Cookie` 記述に `bb-pkce-state` 削除の記載が欠落

**実装側の状況**: `src/app/api/auth/login/discord/route.ts` (L54), `src/app/api/auth/register/discord/route.ts` (L85), `src/app/api/auth/callback/route.ts` (L120) で正しく実装済み。`src/lib/constants/cookie-names.ts` (L43) に `PKCE_STATE_COOKIE` が定義済み。

**影響**: OpenAPI を参照して API クライアントを実装する開発者が PKCE Cookie の存在を認識できない。ただし、`bb-pkce-state` はサーバーサイドの内部メカニズム（HttpOnly Cookie）であり、クライアントから直接操作されることはないため、実害は限定的。

**推奨**: OpenAPI の `/api/auth/login/discord` および `/api/auth/register/discord` の 200 レスポンスに `Set-Cookie` ヘッダ（`bb-pkce-state`, HttpOnly, 10分有効）を追記する。`/api/auth/callback` の 302 レスポンスの `Set-Cookie` 記述に `bb-pkce-state` 削除を追記する。

---

### [MEDIUM-2] ユビキタス言語辞書にインカーネーションモデルの用語が未登録

**対象ファイル**: `docs/requirements/ubiquitous_language.yaml`

**概要**: Sprint-135 の TASK-345 で導入された「インカーネーションモデル」は、ボット復活方式の根幹となる概念であり、D-08 `bot.md` 6.11、D-05 `bot_state_transitions.yaml` (L173, L191)、実装コード、テストコード全体に渡って参照されている。しかし D-02 ユビキタス言語辞書には登録されていない。

**影響**: 新規参加者がドキュメント横断で概念を追跡する際、辞書に定義がないため理解の起点を得にくい。ただし D-08 bot.md 6.11 に十分な説明があるため、既存開発者にとっての実害は小さい。

**推奨**: ユビキタス言語辞書に「インカーネーション (incarnation)」を新規用語として追加する。定義は D-08 bot.md 6.11 を参照先とし、簡潔な説明に留める（DRY原則）。

---

### [LOW-1] D-05 bot_state_transitions.yaml の eliminated->lurking 遷移アクションに `next_post_at` の記載がない

**対象ファイル**: `docs/specs/bot_state_transitions.yaml` (L177-193)

**概要**: D-08 bot.md 2.10 Step 4 では「`next_post_at` を再設定（TDR-010）」と明記されているが、D-05 の `eliminated -> lurking` 遷移アクション一覧 (L177-189) には `next_post_at` のリセットが記載されていない。

**実装側の状況**: `src/lib/services/bot-service.ts` (L766-774) の Step 4.5 で正しく `next_post_at` の再設定が実装済み。実装とD-08は整合している。

**影響**: D-05 は状態遷移の「機械可読な正本」であるため、遷移時のアクションが網羅的でないのは仕様の欠落に該当する。ただし `next_post_at` はスケジューリングの実装詳細であり、状態遷移の本質（lurking/revealed/eliminated の状態変化）には影響しない。

**推奨**: D-05 の `eliminated -> lurking` 遷移の action リストに `next_post_at` の再設定を追記する。

---

## 3. 重点チェック項目の検証結果

### 3.1 reactions.feature v5 と ubiquitous_language.yaml の整合性

**結果: 合格**

- `reactions.feature` のヘッダコメントに「v5」と明記（L2）
- v5 変更点「同日制限撤廃」がシナリオに反映済み（L149-155: 「同日中に同一ユーザーのレスに何度でも草を生やせる」）
- 旧v4シナリオ（同日重複拒否）が正しく削除済み
- 用語「草 (kusa)」は ubiquitous_language.yaml (L598-607) に登録済み
- ステップ定義 `reactions.steps.ts` も v5 対応済み（L20-21: 「重複制限なし（v5 仕様）」、L995-997: 旧ステップ削除コメント）
- 実装 `grass-handler.ts` (L98, L224-226) で重複チェック削除を確認

### 3.2 インカーネーションモデルと bot.md の整合性

**結果: 合格**

- D-08 `bot.md` 6.11 にインカーネーションモデルの設計が詳細に記載されている
- D-05 `bot_state_transitions.yaml` v5.1 (L8) に `eliminated->lurking` 遷移がインカーネーションモデルに変更された旨が記載済み（L173, L178-192）
- 実装 `bot-repository.ts` の `bulkReviveEliminated()` (L519-593) が設計どおり INSERT 方式で実装されている（旧レコード凍結、新レコード INSERT）
- インメモリ実装 `features/support/in-memory/bot-repository.ts` (L441-501) も同一の振る舞いを持つ
- bot-service.ts (L759-774) で Step 4 (incarnation INSERT) + Step 4.5 (next_post_at 再設定) が設計に整合
- テストコード (`bot-service.test.ts`, `bot-service-scheduling.test.ts`, `bot-repository.test.ts`) にインカーネーションモデルのテストケースが存在
- チュートリアルBOT・煽りBOTの復活除外が実装・テスト両方で確認

### 3.3 PKCE認証フローと OpenAPI 認証API仕様の整合性

**結果: 条件付き合格（MEDIUM-1 参照）**

- 実装は正しく動作する構成:
  - OAuth開始: `registration-service.ts` で `generatePkce()` (L43-47) により RFC7636 準拠の `code_verifier` / `code_challenge` を生成
  - Cookie保存: `login/discord/route.ts` (L54) と `register/discord/route.ts` (L85) で `bb-pkce-state` Cookie に `codeVerifier` を保存（HttpOnly, 10分有効）
  - コールバック: `callback/route.ts` (L70) で Cookie から `codeVerifier` を復元し、`exchangeCodeForSupabaseUser()` で code exchange
  - Cookie削除: `callback/route.ts` (L120) で使用済みの `bb-pkce-state` Cookie を削除
- OpenAPI との乖離: MEDIUM-1 に記載のとおり、`Set-Cookie` ヘッダの記述が OpenAPI 仕様書に欠落

### 3.4 範囲攻撃BDDステップ定義と bot_system.feature の対応

**結果: 合格**

bot_system.feature v5.3 の複数ターゲット攻撃シナリオ（L296-393）9件のステップ定義が `bot_system.steps.ts` に実装されている:

| シナリオ | ステップ定義の存在 |
|---|---|
| 範囲指定で複数のボットを順番に攻撃する | 確認 |
| 範囲指定でコイン不足のため全体が失敗する | 確認 |
| 範囲内に無効なターゲットがある場合はスキップして続行する | 確認 |
| 範囲内の全ターゲットが無効の場合はエラーになる | 確認 |
| 賠償金で途中で残高不足になると残りの攻撃が中断される | 確認 |
| 範囲内で同一ボットの複数レスがある場合は2回目以降がスキップされる | 確認 |
| 範囲上限（10ターゲット）を超えるとエラーになる | 確認 |
| カンマ区切りで飛び地のボットを攻撃する | 確認 |
| カンマ区切りと連続範囲の混合で複数ボットを攻撃する | 確認 |

ESC-TASK-347-1（シナリオ5「賠償金で途中で残高不足」のspec-impl不整合）はゼロ報酬プロファイルDI + ダミーボット方式で解決済み。ステップ定義冒頭 (L67-73) にその設計意図が明記されている。

---

## 4. 追加検証

### 4.1 BDDシナリオの状態名と D-05 の一致

bot_system.feature で使用されている状態名（「潜伏中」「暴露済み」「撃破済み」）は D-05 bot_state_transitions.yaml の states セクション（lurking/revealed/eliminated の label）と完全に一致。乖離なし。

### 4.2 D-05 禁止遷移の BDD 検証

D-05 に明示的な `prohibited_transitions` セクションは存在しない。ただし、暗黙の禁止遷移（例: eliminated から直接 revealed への遷移）は、撃破済みボットへの攻撃拒否シナリオ (bot_system.feature L407-413) で間接的に検証されている。

### 4.3 テスト構成と D-10 BDDテスト戦略書の整合性

- ディレクトリ構成: `features/step_definitions/{feature}.steps.ts` の1 feature = 1 stepsファイル原則に準拠
- `features/support/in-memory/` にリポジトリごとのインメモリ実装が配置されている
- FABシナリオの pending 化 + Vitest での代替テスト (`FloatingActionMenu.test.tsx`) は D-10 の方針（DOM操作シナリオはVitest/jsdomで代替）に合致

### 4.4 Sprint-135 テスト結果の妥当性

Sprint 計画書のテスト結果サマリを確認:
- cucumber-js: undefined が 5 -> 3 に減少（-2）。TASK-347 で9件解消、TASK-348 で2件解消の計11件 UNDEFINED 解消。残存 3件は既存（Sprint-135 対象外）
- pending: 16 -> 18 に増加（+2）。FABシナリオ2件の pending 化による
- 整合性: 8シナリオ増加（374->382）、PASS +8（353->361）は計画と一致

---

## レビューサマリー

| 重要度   | 件数  | ステータス |
|----------|-------|-----------|
| CRITICAL | 0     | pass      |
| HIGH     | 0     | pass      |
| MEDIUM   | 2     | info      |
| LOW      | 1     | note      |

判定: **APPROVE** -- CRITICAL/HIGH の問題なし。MEDIUM 2件（OpenAPI の PKCE Cookie 記述漏れ、ユビキタス言語辞書へのインカーネーション用語未登録）は次回スプリントで対応を推奨する。Sprint-135 の4タスクの変更内容は設計書・BDDシナリオ・状態遷移仕様書・実装コードの間で整合が取れている。
