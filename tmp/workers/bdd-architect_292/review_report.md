# レビュー結果: 外部仕様 + 用語辞書

## サマリー
- 判定: WARNING
- 指摘件数: HIGH: 0件 / MEDIUM: 3件 / LOW: 2件

## 指摘事項

### [MEDIUM] M1: OpenAPIのエンドポイントパスが旧名称 `/api/auth/auth-code` のまま
- ファイル: `docs/specs/openapi.yaml`
- 箇所: L281
- 問題: エンドポイントのパスが `/api/auth/auth-code` のまま。概念的に「認証コード」は廃止されたが、エンドポイントURLにその名残が残っている。`operationId: verifyAuth`、`summary: Turnstile認証`、リクエストスキーマ `VerifyAuthRequest`（turnstileTokenのみ）は正しく更新済みであり、機能的な不整合はない。しかし、URLパスに `auth-code` が含まれることで、新規開発者やドキュメント読者に「認証コードが必要」という誤解を与える恐れがある。
- 推奨対応: コード改修のタイミングでエンドポイントパスを `/api/auth/verify` 等に変更することを検討する。ただし、既存のフロントエンド・BDDステップ定義が `/api/auth/auth-code` を参照しているため、変更影響が広い。今回のドキュメント変更フェーズでは対応不要。コード実装フェーズで判断する。

### [MEDIUM] M2: 画面定義 `auth-code.yaml` のファイル名が旧概念を含む
- ファイル: `docs/specs/screens/auth-code.yaml`
- 箇所: ファイル名自体
- 問題: ファイル名 `auth-code.yaml` は「認証コード画面」を意味するが、画面の内容は「書き込み認証（Turnstileのみ）」に更新済み。画面定義の中身（description、elements等）は正しく更新されている。ファイル名だけが旧名称のまま残っている。
- 推奨対応: `auth-verify.yaml` 等にリネームする。ただし、このファイルを参照している箇所（計画書等）も追従が必要。優先度は低いが、コード改修フェーズでエンドポイント名変更と合わせて対応するのが合理的。

### [MEDIUM] M3: BDDシナリオの認証コード関連記述 -- 大部分は更新済みだが、ステップ定義に旧記述が大量残存
- ファイル: `features/authentication.feature`, `features/step_definitions/*.steps.ts`
- 箇所:
  - `authentication.feature`: 6桁コード関連シナリオは削除済み。Feature冒頭説明文も更新済み。Gherkinレベルではほぼ対応完了。
  - `features/step_definitions/authentication.steps.ts`: L4, L38, L80, L106, L148-174, L189-230, L271-286, L629, L793-887 等に「認証コード」「6桁」の旧記述が大量に残存（コメント・ステップ定義・ロジック）。
  - `features/step_definitions/specialist_browser_compat.steps.ts`: L2087, L2103, L2148-2167, L2217-2220, L2426, L2841 等。
  - `features/step_definitions/admin.steps.ts`: L1251-1295（認証コード発行拒否ステップ）。
  - `features/support/in-memory/auth-code-repository.ts`: `findByCode` メソッド等。
- 問題: Gherkinシナリオ（.feature）は概ね更新済みだが、ステップ定義（.steps.ts）とテスト支援コード（in-memory repository）に認証コード前提のロジックが大量に残存している。コード実装フェーズでこれらの整合を取る必要がある。
- 推奨対応: コード実装タスクのスコープにステップ定義の改修を含める。計画書 5.2 の「テストコード」セクションに列挙されている通り、ステップ定義とin-memoryリポジトリの改修が必要。

### [LOW] L1: `features/user_registration.feature` のコメントに旧記述「認証コード」が残存
- ファイル: `features/user_registration.feature`
- 箇所: L5, L10（ファイル冒頭のコメント）
  - L5: `Phase 1-2 では edge-token + 認証コードによる「仮ユーザー」のみが存在した。`
  - L10: `仮ユーザー: edge-token + 認証コードで認証済み、本登録未完了のユーザー`
- 問題: Phase 3向けfeatureの設計背景コメントに「認証コード」の記載が残っている。featureのシナリオ本体（Gherkin行）ではないため、BDD実行に影響はない。ただし、認証コード廃止後はこの記載が事実と異なるものになる。
- 推奨対応: featureファイルの変更に合わせてコメントも更新する。「edge-token + Turnstile」に修正。

### [LOW] L2: `specialist_browser_compat.feature` L121 -- 旧記述は既に修正済み（情報共有）
- ファイル: `features/specialist_browser_compat.feature`
- 箇所: L121
- 問題なし: 計画書では L121 に「レスポンスに認証コードと認証ページURLが含まれる」と記載されていたが、現行のfeatureは `Then レスポンスに認証ページURLが含まれる`（認証コード部分は既に削除済み）。ドキュメントレベルでの不整合はない。
- 推奨対応: 対応不要。情報共有のみ。

## 5ファイル個別レビュー結果

### 1. `docs/specs/screens/auth-code.yaml` -- PASS (指摘 M2 除く)
- 認証コード関連の要素（コード表示、コード入力フィールド）は全て削除済み
- Turnstileウィジェットのみの構成に正しく更新済み
- `description` に認証コードへの言及なし
- `api_dependencies` が `POST /api/auth/auth-code (verifyAuth)` のままだが、OpenAPIのエンドポイントパス自体がまだ `/api/auth/auth-code` なので整合性は取れている（M1, M2はセットで対応すべき）

### 2. `docs/specs/user_state_transitions.yaml` -- PASS
- 状態名 `token_issued`（旧 `code_issued`）に正しく更新済み
- 遷移条件から認証コード関連のguardが全て削除されている
- `token_issued -> authenticated` の trigger が `Turnstile検証成功` のみに正しく変更
- `feature_ref` が `authentication.feature` の現行シナリオ名と一致している
- `write_token` への言及なし（状態遷移定義としては適切。write_tokenは認証状態遷移の外側の概念）

### 3. `docs/specs/user_registration_state_transitions.yaml` -- PASS
- `temporary_user` の description が `edge-token + Turnstile で認証済み` に正しく更新済み
- 「認証コード」への言及なし
- edge-token生成トリガーの用語は一貫している

### 4. `docs/specs/openapi.yaml` -- PASS (指摘 M1 除く)
- `VerifyAuthRequest` スキーマ: `turnstileToken` のみ。`code` フィールドなし。正しい
- `AuthRequiredResponse` スキーマ: `authUrl` のみ。`authCode`, `authCodeUrl` フィールドなし。正しい
- `/api/auth/auth-code` エンドポイント: summary `Turnstile認証`、description にコード言及なし。正しい
- 401レスポンスの `AuthRequiredResponse`: `authUrl` のみ返す定義。正しい

### 5. `docs/requirements/ubiquitous_language.yaml` -- PASS
- 「認証コード」の独立用語エントリは存在しない（削除済み）
- `edge-token` 定義: `Turnstile検証成功後に有効化される` -- 認証コードへの言及なし。正しい
- `無料ユーザー` 定義: `Turnstile + edge-token による認証を完了したユーザー` -- 正しい
- `仮ユーザー` 定義: `edge-token + Turnstile で認証済み` -- 正しい
- 変更履歴コメント (L18): `認証: edge-token + Turnstile 方式に更新` -- これは過去の変更記録なので残存して問題なし

## ドキュメント間の整合性

| 観点 | 結果 |
|---|---|
| OpenAPI VerifyAuthRequest <-> 画面定義 auth-code.yaml | 整合。turnstileTokenのみ |
| 状態遷移 token_issued -> authenticated の guard <-> OpenAPIの認証成功条件 | 整合。Turnstileのみ |
| user_registration_state_transitions の仮ユーザー定義 <-> 用語辞書の仮ユーザー定義 | 整合。`edge-token + Turnstile` |
| 画面定義 api_dependencies <-> OpenAPI パス | 整合。`/api/auth/auth-code` で一致（パス名の旧称問題は M1/M2 で指摘済み） |
| 状態遷移 feature_ref <-> authentication.feature シナリオ名 | 整合。現行シナリオ名と一致 |

## 計画書 (案B) との整合性

計画書 `tmp/auth_simplification_analysis.md` の方針に対するドキュメント変更の網羅性:

| 計画書の指示 | 対応状況 |
|---|---|
| 画面定義からコード入力フィールド削除 | 完了 |
| 状態名 code_issued -> token_issued | 完了 |
| 遷移条件から認証コード削除 | 完了 |
| OpenAPI リクエスト/レスポンスからコード関連フィールド削除 | 完了 |
| 用語辞書「認証コード」削除 | 完了 |
| 仮ユーザー定義の用語更新 | 完了 |
