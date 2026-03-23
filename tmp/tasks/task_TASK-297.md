---
task_id: TASK-297
sprint_id: Sprint-110
status: completed
assigned_to: bdd-coding
depends_on: [TASK-294, TASK-295]
created_at: 2026-03-24T20:00:00+09:00
updated_at: 2026-03-24T20:00:00+09:00
locked_files:
  - e2e/smoke/navigation.spec.ts
  - e2e/helpers/auth.ts
  - e2e/api/auth-cookie.spec.ts
  - e2e/api/senbra-compat.spec.ts
  - src/lib/domain/rules/validation.ts
  - src/lib/domain/rules/__tests__/validation.test.ts
  - src/lib/services/post-service.ts
  - src/lib/infrastructure/repositories/auth-code-repository.ts
  - src/lib/infrastructure/repositories/user-repository.ts
  - src/lib/infrastructure/external/turnstile-client.ts
  - src/lib/infrastructure/repositories/edge-token-repository.ts
  - "src/app/(web)/_components/ThreadCreateForm.tsx"
---

## タスク概要

Sprint-110（認証フロー簡素化）で修正漏れとなったE2Eテスト + デッドコード + コメント内旧用語の修正。
スモークテスト失敗（2件）の根本原因修正を含む。

## 修正内容

### 1. E2Eテスト修正（致命的 — スモークテスト失敗の原因）

#### e2e/smoke/navigation.spec.ts
- 「認証コード検証ページ /auth/verify」セクション（L297-346付近）
  - テスト名を「認証ページ /auth/verify」に更新
  - `#auth-code-input` の検査を削除
  - Turnstileウィジェット（`#cf-turnstile`）の存在確認に変更
  - 「クエリパラメータ code を渡すと認証コードがプリフィルされる」テストを削除（code パラメータは廃止）

#### e2e/helpers/auth.ts
- `#auth-code-display` / `#auth-code-input` の読取り・入力を削除
- Turnstile認証のヘルパーに書き換え（ただし本番E2EではTurnstileはテスト用サイトキーでpassするため、Turnstile待機→送信ボタンクリックに変更）

#### e2e/api/auth-cookie.spec.ts
- `authCode` / `authCodeUrl` の参照を全削除
- `/api/auth/auth-code` → `/api/auth/verify` に変更
- リクエストボディから `code` を削除
- 401レスポンスの `authCode` / `authCodeUrl` アサーションを `authUrl` のみに変更
- `6桁数字` の期待を削除

#### e2e/api/senbra-compat.spec.ts
- `authCode` 取得・送信ロジックを削除
- `/api/auth/auth-code` → `/api/auth/verify` に変更
- リクエストボディから `code` を削除

### 2. デッドコード削除

#### src/lib/domain/rules/validation.ts
- `AUTH_CODE_LENGTH` 定数を削除
- `AUTH_CODE_PATTERN` 定数を削除
- `validateAuthCode()` 関数を削除

#### src/lib/domain/rules/__tests__/validation.test.ts
- `validateAuthCode` テストスイート（L263付近〜末尾）を削除

### 3. コメント内旧用語の修正（低優先だが一括で対応）

以下のファイルで「認証コード」のコメントを適切に修正する。
「廃止済み」注記（Sprint-110追記分）はそのまま残してよい。歴史的文脈として残すべきコメントも維持。
明らかに旧フローを前提とした誤解を招くコメントのみ修正する。

| ファイル | 行(参考) | 修正内容 |
|---|---|---|
| `src/lib/services/post-service.ts` | L226-231 | 「認証コードを発行」→「認証レコードを作成」 |
| `src/lib/infrastructure/repositories/user-repository.ts` | L222, L322 | `verifyAuthCode` → `verifyAuth` |
| `src/lib/infrastructure/external/turnstile-client.ts` | L4 | See参照のシナリオ名更新 |
| `src/lib/infrastructure/repositories/edge-token-repository.ts` | L78 | 「認証コード発行と同時」→「認証レコード作成と同時」 |
| `src/app/(web)/_components/ThreadCreateForm.tsx` | L17 | See参照のシナリオ名更新 |

## 完了条件

- [ ] `npx vitest run` 全件PASS（既存テスト回帰なし）
- [ ] `npx tsc --noEmit` エラーなし
- [ ] `e2e/` 内に `auth-code-input`, `auth-code-display`, `authCodeUrl` の残存なし
- [ ] `src/lib/domain/rules/validation.ts` から `validateAuthCode` 関連コードが削除されている

## スコープ外

- 本番E2Eテストの実行（スモークテストはオーケストレーターが実施）
- ソースコードの機能変更（コメント修正のみ）

## 作業ログ

### チェックポイント
- 状態: 完了
- 完了済み: 全修正項目（E2Eテスト修正・デッドコード削除・コメント修正）
- 未解決の問題: なし

### 進捗ログ
- 全対象ファイルの読み込み完了。修正内容を把握した
- 新APIルート `/api/auth/verify` のシグネチャ確認: `turnstileToken` のみ受付
- 旧 `/api/auth/auth-code` は410 Gone
- 401レスポンス: `authUrl: "/auth/verify"` のみ（`authCode`/`authCodeUrl` 削除済み）
- `validateAuthCode` はテストと本体ファイル以外から未参照 → 安全に削除可能
- featureファイルのシナリオ名変更確認済み
- E2Eテスト修正: navigation.spec.ts, auth.ts, auth-cookie.spec.ts, senbra-compat.spec.ts 完了
- デッドコード削除: validation.ts, validation.test.ts 完了
- コメント修正: post-service.ts, user-repository.ts, turnstile-client.ts, edge-token-repository.ts, ThreadCreateForm.tsx 完了
- 残存確認: `auth-code-input`, `auth-code-display`, `/api/auth/auth-code`（e2e内） → ゼロ件
- 残存確認: `validateAuthCode`, `AUTH_CODE_LENGTH`（src/lib/domain/rules内） → ゼロ件

### テスト結果サマリー
- `npx vitest run`: 88 passed / 1 failed (1747 tests passed, 1 failed)
  - 失敗: `schema-consistency.test.ts` — DBマイグレーション未適用による既知の失敗（本タスク無関係）
- `npx tsc --noEmit`: エラーなし
