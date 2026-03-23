---
task_id: TASK-296
sprint_id: Sprint-110
status: completed
assigned_to: bdd-coding
depends_on: [TASK-294]
created_at: 2026-03-24T18:00:00+09:00
updated_at: 2026-03-24T18:00:00+09:00
locked_files:
  - features/step_definitions/authentication.steps.ts
  - features/step_definitions/specialist_browser_compat.steps.ts
  - features/step_definitions/admin.steps.ts
  - features/support/in-memory/auth-code-repository.ts
---

## タスク概要

認証フロー簡素化に伴うBDDステップ定義 + In-Memoryリポジトリの改修。
featureファイルは人間が更新済み。ステップ定義を新しいfeatureパターンに合わせて更新する。
TASK-294（バックエンド）完了後に実施する。

## 対象BDDシナリオ

- `features/authentication.feature` — 全シナリオ
- `features/specialist_browser_compat.feature` — 認証関連シナリオ
- `features/admin.feature` — BAN + 認証関連シナリオ

## 必読ドキュメント（優先度順）

1. [必須] `features/authentication.feature` — 更新済みBDDシナリオ（ステップパターンの正本）
2. [必須] `features/specialist_browser_compat.feature` — 更新済みBDDシナリオ
3. [必須] `features/admin.feature` — 更新済みBDDシナリオ
4. [参考] `tmp/auth_simplification_analysis.md` §5.2 — テストコードの変更範囲

## 入力（前工程の成果物）

- TASK-294 完了後のサービス層API:
  - `AuthService.issueAuthCode(ipHash, edgeToken)` → 戻り値に `code` なし
  - `AuthService.verifyAuth(edgeToken, turnstileToken, ipHash)` — 新シグネチャ
  - `AuthCodeRepository.findByCode()` 削除済み
  - `AuthCode` 型から `code` フィールド削除済み

## 変更内容の詳細

### 1. authentication.steps.ts — 主要な変更

**ステップパターンのリネーム（featureに合わせる）:**

| 旧パターン | 新パターン | 行番号(参考) |
|---|---|---|
| `認証コード入力ページへの案内が表示される` | `認証ページへの案内が表示される` | L153 |
| `6桁の認証コードが発行される` | 削除（featureに該当ステップなし） | L164 |
| `ユーザーが有効な6桁認証コードを持っている` | 削除（featureに該当ステップなし） | L198 |
| `ユーザーが有効期限切れの6桁認証コードを持っている` | 削除（featureに該当ステップなし） | L220 |
| `ユーザーが /auth/verify で認証コードを送信する` | `ユーザーが /auth/verify でTurnstile認証を完了する` | L284 |
| `ユーザーが認証コードで再認証する` | `ユーザーがTurnstileで再認証する` | L629 |
| `ユーザーがedge-tokenを発行されているが認証コードを未入力である` | `ユーザーがedge-tokenを発行されているがTurnstile認証を完了していない` | L805 |
| `認証コード入力ページへの案内が再度表示される` | `認証ページへの案内が再度表示される` | L872 |

**ステップ実装の変更:**

- `verifyAuthCode(code, turnstileToken, ipHash)` → `verifyAuth(edgeToken, turnstileToken, ipHash)` 呼び出しに変更
- `issueAuthCode(ipHash, edgeToken)` → 戻り値の `code` 参照を削除
- `this.lastResult?.type === "authRequired"` のアサーション内で `code` の検証を削除

**新規ステップ定義が必要な場合:**

featureファイルの各ステップを読み、対応するステップ定義が存在するか確認すること。
既存のステップ定義をリネームすれば対応できるものと、新規作成が必要なものがある。

**重要:** featureファイルのGherkinパターンと、ステップ定義の正規表現/文字列パターンが**完全一致**する必要がある。`npx cucumber-js --dry-run` でundefinedステップがないことを確認すること。

### 2. specialist_browser_compat.steps.ts

**更新箇所（主要）:**

| 行番号(参考) | 変更内容 |
|---|---|
| L2087 | コメント: 「認証コード未入力」→「Turnstile未通過」 |
| L2103 | コメント更新 |
| L2148-2167 | ステップ: 「レスポンスに認証コードと認証ページURLが含まれる」→ featureの新パターンに合わせる |
| L2217-2220 | `issueAuthCode` + `verifyAuthCode` → `issueAuthCode` + `verifyAuth` に変更（引数変更） |
| L2426-2428 | 同上 |
| L2841-2843 | 同上 |

### 3. admin.steps.ts

**更新箇所:**

| 行番号(参考) | 旧 | 新 |
|---|---|---|
| L1251-1262 | `そのIPから認証コード発行を試みる` | featureの新パターンに合わせる（`そのIPから認証（edge-token発行）を試みる` 等） |
| L1285-1295 | `認証コードは発行されない` | featureの新パターンに合わせる |

**重要:** `features/admin.feature` の該当シナリオのGherkinパターンを必ず確認してからパターンを決定すること。

### 4. features/support/in-memory/auth-code-repository.ts

**変更:**
- `AuthCode` 型のimportが更新済み前提（code フィールド削除済み）
- `findByCode()` 関数を削除
- `create()` の引数から `code` フィールドを削除
- `insertForTest()` の引数から `code` フィールドを削除（または任意に）
- コメント: 「6桁認証コード」→「認証レコード」等に更新

**残存メソッド（変更なし）:**
- `markVerified()`, `updateWriteToken()`, `findByWriteToken()`, `clearWriteToken()`, `deleteExpired()`

**新規追加:**
- `findByTokenId(tokenId: string)` — 本番リポジトリに合わせて追加（verifyAuth で使用）

## 完了条件

- [ ] `npx cucumber-js --dry-run` でundefinedステップなし
- [ ] `npx cucumber-js` で既存PASSのシナリオが回帰なし
- [ ] ステップ定義内に `findByCode`, `6桁`, `認証コード入力` の残存なし（コメント内の歴史的経緯説明を除く）

## スコープ外

- `features/*.feature` ファイルの変更（人間が更新済み）
- ソースコードの変更（TASK-294で完了済み）
- フロントエンドUI（TASK-295が担当）

## 補足・制約

- ステップ定義のパターンは feature ファイルのGherkin行と**完全一致**が必須。差異があるとundefinedになる。
- 使われなくなった旧ステップ定義は削除すること（残すと混乱のもと）。
- `npx cucumber-js --dry-run` で事前にundefined検出を確認できる。

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全4ファイルの修正
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- authentication.steps.ts: 10件のステップパターン更新、旧ステップ3件削除、新ステップ1件追加（Turnstile認証を試みる）、verifyAuthCode -> verifyAuth 呼び出し変更、result.code 参照4箇所削除
- specialist_browser_compat.steps.ts: ステップパターン1件更新（レスポンスに認証ページURLが含まれる）、issueAuthCode+verifyAuthCode -> issueAuthCode+verifyAuth 呼び出し3箇所変更、result.code 参照1箇所削除、コメント更新
- admin.steps.ts: ステップパターン2件更新（そのIPから認証を試みる / 認証は拒否される）、コメント更新
- in-memory/auth-code-repository.ts: findByCode() 関数削除、コメント「認証コード」->「認証レコード」更新、verifyAuthCode -> verifyAuth コメント更新

### テスト結果サマリー

- `npx cucumber-js --dry-run`: undefined ステップ 0件
- `npx cucumber-js`: 339 scenarios (323 passed, 16 pending), 1788 steps (1735 passed, 16 pending, 37 skipped), 0 failed
- 16 pending はUI未実装シナリオの既存Pendingで今回の変更に無関係
- 完了条件チェック: `findByCode`, `6桁`, `認証コード入力` の残存 0件（全4ファイル検証済み）
