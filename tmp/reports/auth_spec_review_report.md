# 認証フロー仕様レビュー報告書

> 作成: 2026-03-14 アーキテクトAI
> 分類: アーキテクチャレビュー / 仕様ギャップ分析・是正

---

## 1. 経緯

本番環境での専ブラ動作確認中に「認証コード未入力でも書き込みが成功する」バグが発見された。調査の結果、認証フロー全体に5件のギャップ（G1〜G5）が存在することが判明し、BDDシナリオと実装の両面から是正設計を行った。

## 2. 発見されたギャップ

| ID | 概要 | 深刻度 | 根本原因 |
|---|---|---|---|
| G1 | 認証コード未入力でも書き込みが成功する | 高 | `resolveAuth` が edge-token の存在のみで認証OK判定。認証コード検証の完了（`auth_codes.verified`）を一切チェックしていない |
| G2 | IP変更時の動作が feature 未定義 | 中 | 実装はソフトチェック（ログのみ）で妥当だが、BDD で保証されていない |
| G3 | edge-token 有効期限切れの動作が feature 未定義 | 低 | 実装は新規ユーザー扱いで妥当だが、BDD で保証されていない |
| G4 | 専ブラが Turnstile を使えず認証完了できない | 中 | 専ブラは WebView を持たないため Turnstile ウィジェット表示不可。G1 修正で専ブラからの書き込みが完全ブロックされる |
| G5 | ChMate で認証キャンセル後に書き込み不能 | 中 | 未検証の edge-token Cookie が固定化され認証要求ループに陥る、または ChMate が認証 HTML をエラーキャッシュしている可能性 |

## 3. 設計方針

### 3.1 統一認証フロー

Web UI・専ブラで異なっていた認証経路をサービス層で統一する。

```
[初回書き込み]
  → edge-token 発行（is_verified=false）+ 認証コード発行
  → 認証案内（Web UI: 画面遷移 / 専ブラ: HTML に認証 URL 表示）

[認証ページ /auth/verify]（Web UI・専ブラ共用）
  → Turnstile + 認証コード入力
  → 検証成功 → is_verified=true + write_token 発行

[書き込み再開]
  → Web UI: Cookie が既に有効 → そのまま書き込み
  → 専ブラ（Cookie 共有）: そのまま書き込み
  → 専ブラ（Cookie 非共有）: mail 欄に #<write_token> → Cookie 設定 → 書き込み
```

### 3.2 write_token 方式（先行事例準拠）

他の匿名掲示板の先行事例を調査し、同一方式を採用した。

- 認証完了時に `crypto.randomBytes(16).toString('hex')` で 32 文字 hex を生成
- `auth_codes` テーブルに保存（有効期限 10 分、ワンタイム）
- 専ブラの mail 欄に `#<write_token>` 形式で貼り付けて使用
- bbs.cgi 側でトークンを検出・検証・除去してから書き込み処理に渡す（DAT に漏洩させない）

### 3.3 DB スキーマ変更

| テーブル | カラム | 型 | 用途 |
|---|---|---|---|
| `users` | `is_verified` | `BOOLEAN DEFAULT false` | edge-token の認証完了状態 |
| `auth_codes` | `write_token` | `TEXT` (nullable) | 専ブラ向け認証橋渡しトークン |
| `auth_codes` | `write_token_expires_at` | `TIMESTAMPTZ` (nullable) | write_token の有効期限 |

## 4. BDD シナリオ変更

### authentication.feature（v3 → v4）

| 変更 | シナリオ |
|---|---|
| 修正 | 「正しい認証コードと Turnstile で認証に成功する」— エンドポイントを `/auth/verify` に変更、`write_token` 発行ステップ追加 |
| 修正 | 「Turnstile 検証に失敗すると認証に失敗する」— エンドポイント変更 |
| 修正 | 「期限切れ認証コードでは認証できない」— エンドポイント変更 |
| 追加 | 「edge-token 発行後、認証コード未入力で再書き込みすると認証が再要求される」（G1 対応） |
| 追加 | 「認証済みユーザーの IP アドレスが変わっても書き込みが継続できる」（G2 対応） |
| 追加 | 「edge-token Cookie の有効期限が切れると再認証が必要になる」（G3 対応） |

### specialist_browser_compat.feature（v2 → v3）

| 変更 | シナリオ |
|---|---|
| 追加 | 「専ブラからの初回書き込みで認証案内が返される」 |
| 追加 | 「認証完了後に write_token をメール欄に貼り付けて書き込みが成功する」 |
| 追加 | 「Cookie 共有の専ブラでは認証後そのまま書き込みできる」 |
| 追加 | 「無効な write_token では書き込みが拒否される」 |

## 5. 各ギャップの解決状況

| ID | ステータス | 対応内容 |
|---|---|---|
| G1 | **設計完了・実装待ち** | `users.is_verified` フラグ追加。`verifyEdgeToken` で未検証トークンを拒否。BDD シナリオ追加済み |
| G2 | **設計完了・実装待ち** | 現行ソフトチェック方針を維持。BDD シナリオで明文化済み。IP 変更後も `is_verified` は維持されるため再認証不要 |
| G3 | **設計完了・実装待ち** | 現行挙動（Cookie 消失→再認証）を維持。BDD シナリオで明文化済み |
| G4 | **設計完了・実装待ち** | write_token + mail 欄方式で専ブラ認証を実現。BDD シナリオ追加済み |
| G5 | **実装後に実機検証** | G1+G4 の修正で認証フローが正常化されれば解消見込み。未検証 edge-token に対して認証案内を一貫して返すようになるため、無限ループは発生しなくなる。ただし `buildAuthRequired` の HTML 形式が ChMate に認識されるかは実機テストで確認が必要 |

## 6. 実装タスク一覧

以下をオーケストレーターに引き渡す。依存関係の順序で記載。

| # | タスク | 変更対象 | 依存 |
|---|---|---|---|
| 1 | DB マイグレーション作成・適用 | 新規 SQL ファイル | なし |
| 2 | User ドメインモデルに `isVerified` 追加 | `user.ts`, `user-repository.ts` | 1 |
| 3 | AuthService 修正 — `verifyEdgeToken` に `is_verified` チェック追加 | `auth-service.ts` | 2 |
| 4 | AuthService 修正 — `verifyAuthCode` で `is_verified=true` 更新 + `write_token` 生成・返却 | `auth-service.ts`, `auth-code-repository.ts` | 2 |
| 5 | AuthService 新規 — `verifyWriteToken()` 実装 | `auth-service.ts`, `auth-code-repository.ts` | 4 |
| 6 | PostService 修正 — `resolveAuth` で `not_verified` 処理追加 | `post-service.ts` | 3 |
| 7 | 認証ページ `/auth/verify` 新規作成 | `src/app/(web)/auth/verify/page.tsx` | 4 |
| 8 | bbs.cgi route 修正 — mail 欄 `#xxx` トークン検出・検証・除去 | `bbs.cgi/route.ts` | 5, 6 |
| 9 | `buildAuthRequired` HTML 更新 — 認証 URL・コード表示改善 | `bbs-cgi-response.ts` | なし |
| 10 | auth-code route 修正 — `write_token` をレスポンスに含める | `auth-code/route.ts` | 4 |
| 11 | 設計書更新 | `authentication.md`, `architecture.md` §5 | 全タスク完了後 |
| 12 | G5 実機検証（ChMate） | — | 8, 9 |

## 7. 関連ファイル

| ファイル | 役割 |
|---|---|
| `tmp/auth_spec_review_context.md` | 分析コンテキスト（設計決定サマリ追記済み） |
| `tmp/escalations/escalation_ESC-AUTH-REVIEW-1.md` | BDD シナリオ変更エスカレーション（承認済み） |
| `features/phase1/authentication.feature` | 認証 BDD シナリオ（v4 更新済み） |
| `features/constraints/specialist_browser_compat.feature` | 専ブラ互換 BDD シナリオ（v3 更新済み） |
