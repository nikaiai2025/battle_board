# ESC-AUTH-REVIEW-1: 認証フロー再設計 — BDDシナリオ追加・変更

> 起票: 2026-03-14 アーキテクトAI
> ステータス: **承認済み**（2026-03-14 人間承認）

## 背景

本番環境で「認証コード未入力でも書き込みが成功する」バグ（G1）が発見された。
調査の結果、認証フロー全体に以下のギャップが存在することが判明した：

- G1: 認証バイパス（edge-token存在だけで認証OKとなる）
- G2: IP変更時の動作がfeature未定義
- G3: edge-token有効期限切れの動作がfeature未定義
- G4: 専ブラがTurnstileを使えない
- G5: ChMate認証キャンセル後の書き込み不能

詳細分析: `tmp/auth_spec_review_context.md`

## 設計方針（承認済み）

### 1. 統一認証フロー

Web UI・専ブラともに同一のサービス層認証フローに統一：
1. 初回書き込み → edge-token発行（is_verified=false）+ 認証コード発行
2. 認証ページ `/auth/verify` で Turnstile + 認証コード入力
3. 検証成功 → is_verified=true + write_token発行
4. 書き込み可能（Web UIはCookie直接、専ブラはwrite_tokenをmail欄に貼り付け）

### 2. DBスキーマ変更

- `users.is_verified BOOLEAN DEFAULT false`
- `auth_codes.write_token TEXT` (nullable)
- `auth_codes.write_token_expires_at TIMESTAMPTZ` (nullable)

### 3. write_token仕様

- 認証完了時に `crypto.randomBytes(16).toString('hex')` で32文字hex生成
- 有効期限: 10分（認証コードと同じ）
- ワンタイム（1回使用で無効化）
- 専ブラのmail欄に `#<write_token>` 形式で貼り付けて使用
- bbs.cgi側でトークン検出・検証・除去してから書き込み処理

### 4. 専ブラ認証案内HTML

`buildAuthRequired` で認証コード + 認証ページURLを表示。
先行事例（他の匿名掲示板）と同じ形式。

## BDDシナリオ変更内容

### authentication.feature

- 既存「正しい認証コードとTurnstileで認証に成功する」を `/auth/verify` 経由に修正し write_token 発行を追加
- 追加: 認証バイパス防止シナリオ（G1）
- 追加: IP変更時の継続性シナリオ（G2）
- 追加: edge-token有効期限切れシナリオ（G3）

### specialist_browser_compat.feature

- 追加: 専ブラ認証フローセクション（G4対応、4シナリオ）
