# 認証仕様レビュー — コンテキスト

> 作成: 2026-03-14 オーケストレーターAI
> 目的: アーキテクトAIに認証仕様の整理を依頼するための状況説明

## 発端

本番環境での専ブラ動作確認中に、**認証コードを入力せずに書き込みが成功する**バグが発見された。

## 再現手順（専ブラ Siki）

1. Sikiで初回書き込みを試みる
2. 認証が必要です」というHTML応答が返り、認証コードが表示される
3. **認証コード入力をキャンセル**する
4. 再度書き込みを試みる → **書き込みが成功する**

## 根本原因

`PostService.resolveAuth()` の認証ロジックに問題がある。

### 現在の認証フロー（実装）

```
1回目の書き込み（edge-token Cookie なし）
  → resolveAuth(edgeToken=null)
  → edge-token 新規発行（usersテーブルにレコード作成）
  → 認証コード発行（auth_codesテーブルに保存）
  → authRequired応答 + Set-Cookie: edge-token=xxx
  → 専ブラに「認証が必要です」表示

2回目の書き込み（edge-token Cookie あり ← 1回目で設定された）
  → resolveAuth(edgeToken="xxx")
  → UserRepository.findByAuthToken("xxx") → ユーザーが見つかる
  → IP一致チェック → OK
  → authenticated: true → 書き込み成功 ★問題箇所★
```

**`resolveAuth` は edge-tokenがDBに存在すれば `authenticated: true` を返す。認証コードが入力されたか（`auth_codes.verified = true` か）を一切チェックしていない。**

### BDDシナリオの意図

```gherkin
Scenario: 正しい認証コードとTurnstileで認証に成功する
  Given ユーザーが有効な6桁認証コードを持っている
  And ユーザーがTurnstile検証を通過している
  When ユーザーが /auth-code で認証コードを送信する
  Then edge-token が有効化される        ← 「有効化」= 2段階目
  And 書き込み可能状態になる
```

featureでは「edge-token発行」と「edge-token有効化」の2段階を意図しているが、実装ではこの区別がない。

## BDDシナリオのギャップ一覧

### G1: 認証コード未入力での再書き込み（深刻度: 高）

**未定義の振る舞い:** edge-token発行後、認証コード+Turnstile検証を完了せずに再度書き込みした場合の動作。

**現在の実装:** 書き込みが成功する（認証バイパス）
**期待される動作（推定）:** 認証コード入力が完了するまで書き込み不可

**修正に必要な変更:**
- usersテーブルに `is_verified` フラグ追加（またはauth_codesの状態で判定）
- `resolveAuth` で edge-token存在 + verified=true の両方をチェック
- BDDシナリオの追加

### G2: 認証済みユーザーのIP変更時の動作（深刻度: 中）

**未定義の振る舞い:** 認証済みユーザーのIPが変わった場合（WiFi↔モバイル切り替え等）

**現在の実装:** ソフトチェック（ログ出力のみで書き込み続行）
**懸念:** 方針自体は妥当だが、featureに明文化されていないため設計意図が不明確

### G3: edge-token有効期限（深刻度: 低）

**未定義の振る舞い:** edge-token Cookie期限（30日）切れ後の再認証フロー

**現在の実装:** Cookie消失 → edgeToken=null → 認証フロー再起動（新規ユーザー扱い）
**懸念:** 期限切れの動作がfeatureで保証されていない

### G4: 専ブラでの認証フロー — Turnstile不可（深刻度: 中）

**未定義の振る舞い:** 専ブラ（Siki, ChMate等）はWebViewを持たないため、Turnstileウィジェットを表示できない。認証コード入力ページ（`/auth/auth-code`）にはTurnstileが必須。

**現在の実装:** bbs.cgiの認証案内HTMLに認証ページURLを表示するが、専ブラではTurnstileチャレンジを完了する手段がない
**影響:** G1が修正されると（認証コード未入力で書き込み不可になると）、専ブラからの書き込みが完全にブロックされる可能性がある

## 関連ファイル

| ファイル | 役割 |
|---|---|
| `features/phase1/authentication.feature` | 認証BDDシナリオ（現在の定義） |
| `src/lib/services/post-service.ts` | `resolveAuth()` — 書き込み時の認証判定（L123-182） |
| `src/lib/services/auth-service.ts` | edge-token発行・検証、認証コード発行・検証 |
| `src/lib/infrastructure/external/turnstile-client.ts` | Turnstile検証（SECRET_KEY未設定時は常にtrue） |
| `src/app/(senbra)/test/bbs.cgi/route.ts` | 専ブラ書き込みAPI |
| `src/app/api/auth/auth-code/route.ts` | 認証コード検証API |
| `src/app/api/threads/route.ts` | Web UIスレッド作成API |
| `src/app/api/threads/[threadId]/posts/route.ts` | Web UI書き込みAPI |
| `docs/architecture/architecture.md` | §5 認証アーキテクチャ |
| `docs/architecture/components/authentication.md` | 認証コンポーネント設計 |

## G5: ChMate認証キャンセル後の書き込み不能（深刻度: 中）

> 追記: 2026-03-15 Cloudflare実機テストで発見

**症状:** ChMateでCloudflareに書き込みを試みると認証画面が表示される（ここまでは正常）。キャンセルしても以降の書き込みが一切できなくなる。

**Sikiとの差異:** Sikiでは同じ操作で問題が発生しない（G1により認証バイパスで書き込み成功する）。

**推定原因（要調査）:**

1. **edge-token Cookieの固定化**: 認証レスポンス（`buildAuthRequired`）は `Set-Cookie: edge-token=xxx` を返す。ChMateがこのCookieを保持した場合、次回書き込み時に未認証のedge-tokenで送信→再び認証要求→同じCookieで再送→無限ループの可能性
2. **ChMate固有のレスポンスキャッシュ**: `<title>認証が必要です</title>` をChMateがエラー状態としてキャッシュし、以降のPOSTをブロックしている可能性
3. **bbs.cgiレスポンスのHTMLフォーマット差異**: ChMateが期待する5ch互換のエラーHTML形式と、BattleBoardの `buildAuthRequired` が返すHTML形式の不一致

**G1との関連:**

- G1が現状のまま（認証バイパス可能）→ Sikiは問題なく動作するが、ChMateは認証画面でブロックされる
- G1を修正（認証バイパス不可に）→ Siki・ChMate両方で認証完了が必要になるが、G4（専ブラTurnstile問題）が顕在化する

つまりG1・G4・G5は連鎖する問題であり、専ブラの認証フロー全体を設計し直す必要がある。

**再現条件:**
- ホスト: Cloudflare（Vercelは読み取り自体が不可のため未検証）
- 専ブラ: ChMate
- 操作: 書き込み試行→認証画面キャンセル→再度書き込み試行

## 検討すべき論点（解決済み）

> 以下は 2026-03-14 のアーキテクトレビューで全て方針決定済み。

1. **G1の修正方針** → `users.is_verified` フラグ追加で決定
2. **G4との整合** → 先行事例に倣い「Webブラウザで認証 + write_tokenをmail欄に貼り付け」方式で決定
3. **G5のChMate固有挙動** → G1+G4修正で認証フロー正常化後に再検証
4. **G1・G4・G5の連鎖** → 統一認証フローとして一括設計済み
5. **G2のIP変更ポリシー** → 現行ソフトチェック維持、featureに明文化済み
6. **DBスキーマ変更** → `users.is_verified`, `auth_codes.write_token`, `auth_codes.write_token_expires_at` 追加
7. **状態遷移仕様** → edge-tokenの状態遷移（未発行→発行済み未検証→検証済み）を設計書に反映予定

## 設計決定サマリ（2026-03-14 承認済み）

### 統一認証フロー

Web UI・専ブラ共通のサービス層認証フロー:
1. 初回書き込み → edge-token発行（`is_verified=false`）+ 認証コード発行
2. 認証ページ `/auth/verify` で Turnstile + 認証コード入力
3. 検証成功 → `is_verified=true` + `write_token` 発行（32文字hex、10分有効、ワンタイム）
4. 書き込み可能（Web UIはCookie直接、専ブラは `mail=#<write_token>` で認証橋渡し）

### BDDシナリオ変更

- `authentication.feature` v3 → v4: G1/G2/G3対応シナリオ追加、認証エンドポイントを `/auth/verify` に統一
- `specialist_browser_compat.feature` v2 → v3: 専ブラ認証フローセクション追加（4シナリオ）

### エスカレーション

`tmp/escalations/escalation_ESC-AUTH-REVIEW-1.md` に記録（承認済み）

### 次のアクション

実装タスクの作成が必要（オーケストレーターAI or 人間）:
- DBマイグレーション（`users.is_verified`, `auth_codes.write_token`）
- `auth-service.ts` 修正（`verifyEdgeToken` の `is_verified` チェック、`verifyAuthCode` の `write_token` 生成、新規 `verifyWriteToken`）
- `post-service.ts` 修正（`resolveAuth` の `not_verified` 処理）
- `bbs.cgi/route.ts` 修正（mail欄 `#xxx` トークン検出・検証・除去）
- `bbs-cgi-response.ts` 修正（`buildAuthRequired` のHTML更新）
- `/auth/verify` ページ新規作成（Turnstile + コード入力 + write_token表示）
- 設計書更新（`authentication.md`, `architecture.md` §5）
