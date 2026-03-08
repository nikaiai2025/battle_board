---
task_id: TASK-006
sprint_id: Sprint-4
status: completed
assigned_to: bdd-coding
depends_on: [TASK-004, TASK-005]
created_at: 2026-03-08T22:00:00+09:00
updated_at: 2026-03-08T22:00:00+09:00
locked_files:
  - "[NEW] src/lib/infrastructure/external/turnstile-client.ts"
  - "[NEW] src/lib/services/auth-service.ts"
  - "[NEW] src/app/api/auth/auth-code/route.ts"
---

## タスク概要
Phase 1 Step 4 — 認証サービスを実装する。
TurnstileClient（外部API）、AuthService（認証ロジック統括）、認証コードAPI（Route Handler）の3層を作成する。
一般ユーザーのedge-token方式認証と管理者認証（Supabase Auth）の2系統を実装する。

## 対象BDDシナリオ
- `features/phase1/authentication.feature` — 認証コード関連シナリオ（書き込み認証4シナリオ + 日次リセットID4シナリオ + 管理者2シナリオ）
- 注: BDDシナリオのステップ定義は本タスクのスコープ外。サービス層の実装に集中する

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/architecture.md` — §5 認証アーキテクチャ（§5.1 一般ユーザー, §5.2 日次リセットID, §5.3 管理者, §5.4 ボット）
2. [必須] `docs/architecture/components/authentication.md` — 公開インターフェース（verifyEdgeToken, issueAuthCode, verifyAuthCode, verifyAdminSession, generateDailyId）
3. [必須] `features/phase1/authentication.feature` — BDDシナリオ（認証フロー理解のため）
4. [必須] `src/lib/infrastructure/repositories/user-repository.ts` — 既存リポジトリ
5. [必須] `src/lib/infrastructure/repositories/auth-code-repository.ts` — 既存リポジトリ（AuthCode型含む）
6. [必須] `src/lib/domain/rules/daily-id.ts` — generateDailyId（既存純粋関数）
7. [参考] `docs/specs/openapi.yaml` — 認証関連API定義

## 入力（前工程の成果物）
- `src/lib/infrastructure/repositories/user-repository.ts` — UserRepository（TASK-004）
- `src/lib/infrastructure/repositories/auth-code-repository.ts` — AuthCodeRepository（TASK-005）
- `src/lib/domain/rules/daily-id.ts` — generateDailyId（TASK-003）
- `src/lib/infrastructure/supabase/client.ts` — Supabaseクライアント（Sprint-1）

## 出力（生成すべきファイル）

### `src/lib/infrastructure/external/turnstile-client.ts`
Cloudflare Turnstile APIの検証クライアント。
- `verifyTurnstileToken(token: string, remoteIp?: string): Promise<boolean>`
- 環境変数: `TURNSTILE_SECRET_KEY` を使用
- エンドポイント: `https://challenges.cloudflare.com/turnstile/v0/siteverify`
- テスト用: 環境変数未設定時は常にtrueを返す（開発環境用）

### `src/lib/services/auth-service.ts`
認証ロジックの統括サービス。authentication.md §2 の公開インターフェースに準拠。

**一般ユーザー認証:**
- `verifyEdgeToken(token: string, ipHash: string): Promise<VerifyResult>` — UserRepositoryでトークン検索→ユーザー存在確認→IP整合チェック（ソフト: ログのみ）
- `issueEdgeToken(ipHash: string): Promise<{ token: string; userId: string }>` — CSPRNGでトークン生成→UserRepository.create→CurrencyRepository.create（初期付与）→トークン返却
- `issueAuthCode(ipHash: string, edgeToken: string): Promise<{ code: string; expiresAt: Date }>` — 6桁コード生成→AuthCodeRepository.create→コード返却
- `verifyAuthCode(code: string, turnstileToken: string, ipHash: string): Promise<boolean>` — AuthCodeRepository.findByCode→有効期限チェック→TurnstileClient.verify→AuthCodeRepository.markVerified

**管理者認証:**
- `verifyAdminSession(sessionToken: string): Promise<AdminSession | null>` — Supabase Auth セッション検証ラッパー

**ユーティリティ:**
- `hashIp(ip: string): string` — IPアドレスのSHA-512ハッシュ
- `reduceIp(ip: string): string` — IPv4はそのまま、IPv6は/48プレフィックスに縮約

型定義（auth-service.ts内で定義）:
```typescript
type VerifyResult =
  | { valid: true; userId: string; authorIdSeed: string }
  | { valid: false; reason: 'not_found' | 'ip_mismatch' };

interface AdminSession {
  userId: string;
  email: string;
  role: string;
}
```

### `src/app/api/auth/auth-code/route.ts`
認証コードの検証APIエンドポイント。
- `POST /api/auth/auth-code` — リクエスト: `{ code: string; turnstileToken: string }`、レスポンス: 成功/失敗
- Cookie操作: edge-tokenの読み取り、認証成功時のCookie更新はRoute Handler内で処理
- AuthServiceへの委譲のみ行い、ビジネスロジックを含まない

## 完了条件
- [ ] 3ファイルが作成されている
- [ ] AuthServiceがauthentication.md §2の公開インターフェースに準拠している
- [ ] TurnstileClientが環境変数未設定時にフォールバックする
- [ ] edge-tokenの生成にCSPRNG（crypto.randomUUID等）を使用している
- [ ] 認証コードが6桁数字で生成される
- [ ] IP整合チェックがソフトチェック（不一致でも通過、ログ記録のみ）
- [ ] テストコマンド: `npx vitest run` で既存テスト（164件）が壊れていないこと
- [ ] AuthServiceの単体テスト（モック使用）が作成されている

## スコープ外
- BDDシナリオのステップ定義実装（Step 5以降でPostServiceと統合テスト）
- Web UIの認証画面（Step 7）
- 専ブラからの認証フロー（Step 9）
- 管理者ログインUI（Step 8）

## 補足・制約
- AuthServiceはCookieを直接操作しない（authentication.md §5 設計判断）。Cookie読み書きはRoute Handler内で行う
- edge-tokenはCSPRNG（`crypto.randomUUID()`）で生成する
- `author_id_seed`の生成: `sha512(reduceIp(ip))`。reduceIpはIPv4そのまま、IPv6は先頭48bit（/48）に縮約
- 認証コードの有効期限: 10分（600秒）
- IP整合チェック: 不一致時も処理続行（モバイル回線のIP変動考慮）。console.warnでログ記録のみ

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 3ファイル実装・単体テスト44件作成・全208件PASS確認
- 次にすべきこと: なし（タスク完了）
- 未解決の問題: なし

### 進捗ログ
- 2026-03-08: タスク開始。既存テスト164件PASS確認（vitest run）
- 実装対象: turnstile-client.ts / auth-service.ts / auth-code/route.ts
- 2026-03-09: セッション再開。3ファイルすべて実装済みを確認。AuthServiceテスト44件作成済みを確認。
- 2026-03-09: `npx vitest run` 実行。全208件PASS（5テストファイル）。タスク完了。

### テスト結果サマリー
- テストファイル: 5件 PASS
- テスト件数: 208件 PASS / 0件 FAIL
- 内訳:
  - daily-id.test.ts: 14件
  - validation.test.ts: 55件
  - incentive-rules.test.ts: 62件
  - anchor-parser.test.ts: 33件
  - auth-service.test.ts: 44件（新規追加）
- 実行時間: 532ms
- 完了条件チェック:
  - [x] 3ファイルが作成されている（turnstile-client.ts / auth-service.ts / auth-code/route.ts）
  - [x] AuthServiceがauthentication.md §2の公開インターフェースに準拠している
  - [x] TurnstileClientが環境変数未設定時にフォールバックする
  - [x] edge-tokenの生成にCSPRNG（crypto.randomUUID）を使用している
  - [x] 認証コードが6桁数字で生成される
  - [x] IP整合チェックがソフトチェック（不一致でも通過、ログ記録のみ）
  - [x] `npx vitest run` で全208件PASSを確認
  - [x] AuthServiceの単体テスト（モック使用）44件が作成されている
