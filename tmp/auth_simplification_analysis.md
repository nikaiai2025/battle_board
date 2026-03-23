# 認証フロー簡素化の検討メモ

> 作成日: 2026-03-24
> ステータス: 検討中（方向性: 案B）
> 関連: 認証決定ログ (`docs/requirements/decision_log/decision_log_auth_architecture_2026-03-04.md`)

## 1. 検討の動機

現在の一般ユーザー認証フローでは、初回書き込み時に「6桁の認証コード入力 + Turnstile」の2段階を課している。この設計の妥当性を見直し、Turnstileのみで十分か評価する。

## 2. 現行フローの構造的問題

### 2.1 6桁コードが「自分に自分で合言葉を言う」設計になっている

画面要素定義書 (auth-code.yaml) にも明記されている通り:

> 認証コードは画面に表示される（メール送信ではない）。ボット防止が目的であり、人間であることの確認のみ。

- **Web UI**: AuthModal がコードを表示し、その直下のフォームに手入力させる
- **専ブラ**: 認証URLに `?code=XXXXXX` でプリフィル済み。ユーザーが入力する必要すらない

別チャネル送信（メール/SMS）ではないため、知識認証としての意味がない。DOMを読める自動化スクリプトにとってコード入力は障壁にならず、ボット排除の実質的な効果はTurnstileが担っている。

### 2.2 セキュリティへの寄与が限りなくゼロ

| 脅威 | Turnstile + 6桁コード | Turnstileのみ | 差分 |
|---|---|---|---|
| ブラウザ自動操作Bot | Turnstileが主防御。コードはDOM読取で突破可 | Turnstileが防御 | なし |
| CAPTCHAファーミング | Turnstile突破後、コードも読める | Turnstileが防御 | なし |
| CSRF | edge-token Cookie (same-origin) + コード | edge-token Cookie (same-origin) | なし |
| Turnstileトークン使い回し | コードがセッションに紐付く | edge-tokenでセッション紐付け可能 | 案Bでedge-token紐付けを実装すれば同等 |

### 2.3 `findByCode` のスケーラビリティ問題

`AuthCodeRepository.findByCode(code)` は6桁コードのみで検索し `.single()` を使用。`token_id` (edge-token) でフィルタしていない。

- コード空間: 10^6 = 100万通り（有効期限10分以内の衝突確率は誕生日のパラドックスに従う）
- 衝突時: `.single()` が複数行エラー → 両ユーザーとも認証失敗（DoS。セキュリティ侵害にはならない）
- 現行スケール（DAU 30）では無視可能だが、構造的弱点として残存

## 3. 専ブラ認証フローの詳細追跡

### 3.1 ステップ図

```
Step 1: 専ブラで初回書き込み
  [専ブラ] ──POST bbs.cgi──> [サーバ]
                               resolveAuth(null, ipHash)
                               → user作成 (is_verified=false)
                               → edge-token発行
                               → auth_code発行
          <── ＥＲＲＯＲ応答 ──
              Set-Cookie: edge-token=<token>  ← Cookieはここで専ブラに保存される
              Body: 認証URL + 認証コード

Step 2: ブラウザで認証
  [ブラウザ] /auth/verify?code=XXXXXX&token=<token>
             Turnstile通過 → POST /api/auth/auth-code
                              → verifyAuthCode()
                              → users.is_verified = true  ← DBが更新される
                              → write_token生成・保存
             画面: 「認証完了。専ブラの方は #<write_token> をメール欄に」

Step 3: 専ブラで2回目の書き込み
  [専ブラ] ──POST bbs.cgi──>
           Cookie: edge-token=<token>  ← Step 1で保存済み
                               case①: Cookie検証
                               → verifyEdgeToken → user.is_verified=true  ← Step 2で更新済み
                               → 認証成功（write_tokenの入力は不要）
          <── 書きこみました ──
```

### 3.2 write_tokenが不要になる理由

Step 1で専ブラにCookieが保存され、Step 2で当該ユーザーの `is_verified` がtrueに更新される。Step 3では専ブラがCookieを送信するため、サーバは `edge-token → user → is_verified=true` の経路で認証を完了する。**write_tokenの入力は一切不要。**

BDDシナリオにもこの動作は正しく記述されている:
- `Cookie共有の専ブラでは認証後そのまま書き込みできる` (L133-137)
- `専ブラがbbs.cgi応答のedge-token Cookieを保存し次回リクエストで送信する` (L139-148)

### 3.3 write_tokenが必要になるケース

write_tokenは「専ブラのCookieが失われた場合のフォールバック」:
- 専ブラのアプリ再インストール
- 手動でのCookie削除
- 異なるデバイスの専ブラ

ただし、write_tokenはワンタイム（1回使用で消費される）かつ有効期限10分のため、フォールバック手段としても限定的。使用後はCookieが再設定され、以降はCookie認証に切り替わる。

### 3.4 現在の案内文の問題

bbs.cgi の `buildAuthRequired` は常に write_token の使用を手順として案内している:

```
【手順】
1. 以下のURLにブラウザでアクセスしてください
2. 認証コード XXXXXX を入力して認証を完了してください
3. 発行された write_token をメール欄に "#write_token値" 形式で貼り付けて再度書き込んでください
```

大半のケースでStep 3は不要。ユーザーに不必要な手間を指示している。

## 4. 同時並行での認証における衝突リスク

### 4.1 write_token: 安全

- `randomBytes(16).toString('hex')` = 128ビットの暗号学的乱数。衝突確率は実質ゼロ
- 各write_tokenは独立した `auth_codes → edge_token → user` 経路をたどる
- TOCTOU（同一write_tokenの二重検証）は冪等（同一ユーザーが2度verifiedになるだけ）

### 4.2 6桁認証コード: 軽微な問題あり

- `.single()` がコードのみで検索 → 同一コードを持つ複数レコードがあるとエラー
- DAU 30規模では無視可能（同時有効コード10程度 → 衝突確率 ~0.005%）
- 対策: 検索条件に `token_id` を追加するか、コード自体を廃止する

## 5. 方針: 案B（6桁コード廃止 + write_token整理）

### 5.1 簡素化後のフロー

**Web UI:**
```
書き込み試行 → edge-token発行 (is_verified=false)
  → Turnstile付き認証画面表示（コード入力なし）
  → Turnstile通過 → edge-token有効化 (is_verified=true)
  → 書き込み可能
```

**専ブラ:**
```
bbs.cgi POST → edge-token発行 + Cookie設定
  → エラーHTMLに認証URL表示（コードなし）: /auth/verify?token=<token>
  → ブラウザで認証URL開く → Turnstile通過 → is_verified=true
  → 専ブラで再書き込み（Cookie認証で成功）
  → (Cookie喪失時のみ write_token をフォールバックとして提供)
```

### 5.2 変更の影響範囲

#### BDDシナリオ（エスカレーション対象）

| 対象 | 変更内容 |
|---|---|
| `features/authentication.feature` | 以下のシナリオを修正・廃止 |
| | - L15-20: 未認証ユーザーへの認証コード案内 → コード発行の削除 |
| | - L22-28: 認証コード+Turnstileで認証成功 → Turnstileのみに |
| | - L30-35: Turnstile検証失敗 → 6桁コード前提条件を削除 |
| | - L37-41: 期限切れ認証コード → **シナリオ廃止** |
| | - L47-51: 認証コード未入力で再書き込み → 「Turnstile未通過」等に変更 |
| | - L66-70: edge-token有効期限切れ → 案内文言変更 |
| | - L85-90: Cookie削除後の再認証 → 「認証コードで再認証する」文言変更 |
| | - Feature冒頭説明文 (L5-8) の用語修正 |
| `features/specialist_browser_compat.feature` | L121「レスポンスに認証コードと認証ページURLが含まれる」→ 認証コード部分を削除 |
| `features/admin.feature` | L108-111: BANされたIPからの認証コード発行拒否 → 「認証（edge-token発行+Turnstile）が拒否される」に変更 |

#### 仕様・設計ドキュメント

| 対象 | 変更内容 |
|---|---|
| `docs/specs/screens/auth-code.yaml` | 画面定義からコード入力フィールド削除 |
| `docs/specs/openapi.yaml` | `/api/auth/auth-code` エンドポイント定義、401レスポンスの `authCode`/`authCodeUrl` フィールド |
| `docs/specs/user_state_transitions.yaml` | 「認証コード発行済み」状態の名称・遷移条件 |
| `docs/architecture/architecture.md` | auth_codesテーブル定義、認証フロー説明、TDR-001 |
| `docs/architecture/components/authentication.md` | 認証コンポーネント設計全体 |
| `docs/requirements/ubiquitous_language.yaml` | 「認証コード」用語定義 |

#### ソースコード

| 対象 | 変更内容 |
|---|---|
| `src/lib/services/auth-service.ts` | `generateAuthCode`, `issueAuthCode`, `verifyAuthCode` の簡素化 |
| `src/lib/services/post-service.ts` | `resolveAuth` の `issueAuthCode` 呼び出し削除、戻り値型から `code` フィールド削除 |
| `src/lib/infrastructure/repositories/auth-code-repository.ts` | `findByCode` 廃止 |
| `src/lib/infrastructure/adapters/bbs-cgi-response.ts` | `buildAuthRequired` の引数から `code` 削除、案内文修正 |
| `src/app/api/auth/auth-code/route.ts` | コード検証ロジック削除 |
| `src/app/api/threads/[threadId]/posts/route.ts` | 401レスポンスから `authCode`, `authCodeUrl` 削除 |
| `src/app/api/threads/route.ts` | 同上（スレッド作成API） |
| `src/app/(web)/auth/verify/page.tsx` | コード入力UI削除、URLパラメータ `code` 処理削除、Turnstileのみに |
| `src/app/(web)/_components/AuthModal.tsx` | コード表示・入力UI削除 |
| `src/app/(web)/_components/PostForm.tsx` | 401レスポンスの `data.authCode` 参照削除 |
| `src/app/(web)/_components/ThreadCreateForm.tsx` | 同上 |
| `src/types/index.ts` | `CreatePostResult` 型の `authRequired.code` フィールド削除 |
| `src/app/(senbra)/test/bbs.cgi/route.ts` | 認証案内HTML修正（`authRequired.code` / `result.code` 参照削除） |

注: `handleCreatePost` と `handleCreateThread` で authRequired レスポンス構造が異なる（ネスト vs フラット）。改修時に統一すること。

#### DB

| 対象 | 変更内容 |
|---|---|
| `supabase/migrations/` | `auth_codes.code` カラムを削除 |

#### テストコード（実装に追従して修正）

| 対象 | 変更内容 |
|---|---|
| `src/lib/services/__tests__/auth-service.test.ts` | `generateAuthCode`, `verifyAuthCode`, `findByCode` 関連テスト |
| `src/lib/services/__tests__/post-service.test.ts` | 認証コード再発行シナリオ |
| `src/app/api/auth/auth-code/__tests__/route.test.ts` | auth-codeルートハンドラテスト全体 |
| `src/app/(web)/auth/verify/__tests__/verify-page-logic.test.ts` | 認証コードバリデーション |
| `features/step_definitions/authentication.steps.ts` | 認証コード関連ステップ定義（L153-295, L629, L793-887等） |
| `features/step_definitions/specialist_browser_compat.steps.ts` | `verifyAuthCode` 呼び出し箇所 |
| `features/step_definitions/admin.steps.ts` | 認証コード発行拒否ステップ定義 |
| `features/support/in-memory/auth-code-repository.ts` | `findByCode` メソッド廃止 |

### 5.3 残存させるもの

- **Turnstile**: 人間確認の主防壁（変更なし）
- **edge-token + is_verified**: セッション管理の基盤（変更なし）
- **write_token**: Cookie喪失時のフォールバック（維持。案内文の優先度を下げる）
- **auth_codesテーブル**: edge-tokenとTurnstile検証の紐付け管理として存続（code列は廃止候補）

## 6. 案Bを選択する理由

6桁認証コードは画面表示→同画面入力という設計であり、知識認証（メール/SMS等の別チャネル送信）として機能していない。ボット排除の実効性は全面的にTurnstileに依拠しており、6桁コードのセキュリティ寄与はゼロ。コードの存在はUXコスト（不必要な入力ステップ・誤解を招く案内文）と構造的弱点（`findByCode` の衝突問題）を生むのみ。

代替案（コード空間拡大、`findByCode` へのフィルタ追加等）は衝突問題のみを解決するが、知識認証として機能しないという本質的問題は残る。コードをメール/SMS送信に変更すれば知識認証として機能するが、匿名掲示板の要件（メール不要）と矛盾する。

## 7. 次のアクション

- [ ] BDDシナリオ変更のエスカレーション起票
- [ ] 改修タスクの分割・計画
