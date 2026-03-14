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

## 検討すべき論点

1. **G1の修正方針**: `users.is_verified` フラグ vs `auth_codes` テーブルの状態判定 vs 他のアプローチ
2. **G4との整合**: G1を修正すると専ブラからの書き込みがブロックされる。専ブラ向けの認証手段をどうするか
   - 選択肢A: 専ブラはTurnstile免除（認証コードのみで認証）
   - 選択肢B: 専ブラユーザーはWebブラウザで認証ページを開いてTurnstile通過 → edge-token Cookieを専ブラに設定
   - 選択肢C: 専ブラは別の認証手段（例: bbs.cgiのPOSTパラメータに認証コードを含める）
3. **G2のIP変更ポリシー**: 現在のソフトチェックを維持するか、featureに明文化するか
4. **DBスキーマ変更の要否**: `users` テーブルへのカラム追加が必要か
5. **状態遷移仕様(D-05)の更新要否**: edge-tokenの状態遷移（未認証→認証済み）を明文化すべきか
