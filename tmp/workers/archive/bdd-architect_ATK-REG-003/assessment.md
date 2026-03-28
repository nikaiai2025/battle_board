# ATK-002-1: パスワード更新の recovery フロー認可チェック欠如

## 判定: 対応推奨

## 問題の実在確認

指摘は正確である。以下に根拠を示す。

### 攻撃シナリオの再現パス

1. ユーザーが通常ログインし edge-token Cookie を取得する（`POST /api/auth/login` 等）
2. そのまま `POST /api/auth/update-password` に `{ "password": "newpass123" }` を送信する
3. `route.ts:76` で `verifyEdgeToken(edgeToken, "")` が呼ばれ、edge-token が有効なら `authResult.valid === true` となる
4. `RegistrationService.updatePassword(authResult.userId, password)` が実行され、パスワードが変更される

### コード上の証拠

**`src/app/api/auth/update-password/route.ts`**（L65-83）:
edge-token の存在と有効性のみを検証している。このトークンが recovery フロー（`/api/auth/confirm?type=recovery`）で発行されたものか、通常ログインで発行されたものかを区別する手段がない。

**`src/lib/infrastructure/repositories/edge-token-repository.ts`**:
`EdgeTokenRow` の定義は `{ id, user_id, token, created_at, last_used_at }` のみ。`purpose` や `flow_type` のような属性は存在しない。DB スキーマ（`00006_user_registration.sql`）にも同様に存在しない。

**`src/lib/services/registration-service.ts`**（L437-456）:
`updatePassword(userId, newPassword)` は userId と新パスワードのみを受け取る。呼び出し元がどのフローかを検証するロジックは一切ない。

### BDD テストの検証盲点

**`features/step_definitions/user_registration.steps.ts`**（L2507-2520）:
BDD テストの「新しいパスワードを入力して確定する」ステップは `RegistrationService.updatePassword(this.currentUserId, ...)` をサービス層で直接呼び出している。HTTP API 経由のテストではないため、「recovery 以外のフローで発行された edge-token でも API を叩ける」という経路がテスト対象外となっている。

## 影響分析

### 影響範囲

- **自己アカウント限定**: edge-token は自分のユーザーにしか紐付かないため、他人のパスワードを変更することはできない
- **本登録ユーザー限定**: `updatePassword` は `user.supabaseAuthId` の存在をチェックしているため、仮ユーザーには影響しない

### BDD シナリオの意図との照合

BDD シナリオ（L150-155）は明確に recovery フローを前提としている:

```
Scenario: パスワード再設定リンクから新しいパスワードを設定する
  Given 本登録ユーザーがパスワード再設定メールを受信している
  When メール内の再設定リンクをクリックする
  And 新しいパスワードを入力して確定する
  Then パスワードが更新される
  And 新しいパスワードでログインできる
```

Given が「パスワード再設定メールを受信している」であり、前提条件はメールリンク経由の recovery フローである。「ログイン済みユーザーが自由にパスワード変更できる」というシナリオは存在しない。

### 「ログイン済みユーザーの自発的パスワード変更」は許容されるか

BDD シナリオにこの振る舞いは定義されていない。つまり意図された機能ではない。ただし、結果として起きることは「自分のパスワードを自分で変えられる」であり、セキュリティ侵害とは言いがたい。一般的な Web アプリケーションでも「現在のパスワード」の入力を求めたうえでのパスワード変更機能は標準的である。

問題の本質は、**設計意図として recovery フロー限定のエンドポイントが、アクセス制御の不備により無条件で開放されている**ことである。

## 「対応推奨」の根拠

| 判断軸 | 評価 |
|---|---|
| セキュリティ侵害 | 低い（他者への攻撃は不可能） |
| データ損失 | なし |
| 機能破綻 | なし（パスワードは正常に更新される） |
| 設計意図との乖離 | あり（recovery フロー限定のはずが無条件開放） |
| 悪用の現実的リスク | 限定的（セッションハイジャックとの組み合わせでリスク上昇） |

セッションハイジャック（XSS 等で edge-token Cookie を窃取）が発生した場合、攻撃者がパスワードまで変更可能になる点は無視できない。recovery フロー限定であれば、メールアドレスへのアクセスが追加の防御層となる。ただし、現時点では XSS 対策（httpOnly Cookie、CSP 等）が別途存在するため、即座の機能破綻には至らない。

## 修正方針

短期的かつ最小限の修正として、以下の2案を提示する。

### 案A: edge-token にフロー種別を付与する（推奨）

1. `edge_tokens` テーブルに `purpose` カラム（`'general' | 'recovery'`、デフォルト `'general'`）を追加する
2. `handleRecoveryCallback` で edge-token を作成する際に `purpose = 'recovery'` を設定する
3. `POST /api/auth/update-password` の認可チェックで `purpose === 'recovery'` を検証する
4. パスワード更新成功後に当該 edge-token の `purpose` を `'general'` に更新する（または削除して通常ログインに誘導する）

**メリット**: フロー種別が DB レベルで明確になり、将来的に他のフロー限定操作にも応用可能

**デメリット**: DB マイグレーションが必要

### 案B: 短命トークンによるワンタイム認可

1. `handleRecoveryCallback` でパスワード変更専用の短命トークン（5分有効、ワンタイム）を発行し、Cookie またはセッションストレージに設定する
2. `POST /api/auth/update-password` でこのトークンの存在と有効性を検証する
3. パスワード更新成功後にトークンを消費（削除）する

**メリット**: 既存の edge-token スキーマを変更しない

**デメリット**: 新テーブルまたは新カラムが必要な点は同じ。ワンタイムトークンの管理が増える

### 推奨: 案A

理由: edge-token の発行目的を明示的に区別する方が、長期的な保守性とセキュリティモデルの明確さで優れている。
