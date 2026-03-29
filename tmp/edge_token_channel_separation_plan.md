# edge-token チャネル分離 実装計画

> ステータス: 承認待ち
> 作成日: 2026-03-29
> 根拠資料: `docs/research/chmate_token_web_session_separation_2026-03-29.md`

## 1. 経緯

1. ChMate は HTTP 通信を強制し、Secure/SameSite Cookie を保存しない（実機診断で確認済み）
2. 現行設計では単一の `edge-token` が専ブラ互換経路（HTTP）と Web API 経路（HTTPS）の両方で認証に使用されている
3. ChMate 経由で edge-token が漏洩した場合、マイページ閲覧・PAT 取得/再発行まで到達可能
4. 本登録ユーザーが ChMate を併用する場合、PAT 自体も初回認証時に HTTP 平文で流れる
5. トークン分離により、HTTP 上で漏洩しうる認証子の権限を投稿のみに限定すれば、致命的なアカウント被害は防げる
6. 課金機能実装のブロッカーとして正式採用する

## 2. 方針

`edge_tokens` テーブルに `channel` カラムを追加し、発行元で書き分ける。

| channel | 発行経路 | 許可操作 |
|---|---|---|
| `web` | Web UI（/auth/verify, 本登録, ログイン） | 全権限（マイページ, PAT, 設定変更等） |
| `senbra` | 専ブラ互換（bbs.cgi, PAT認証） | 投稿系のみ |

Web API（`/api/mypage/*`, `/api/auth/pat`）は `channel = 'web'` のトークンのみ受理する。

完全なトークン分離（別テーブル・別サービス）は課金フェーズで必要に応じて検討する。

## 3. 変更箇所

### 3.1 DB

- `edge_tokens` に `channel VARCHAR NOT NULL DEFAULT 'web'` を追加
- 既存レコードは `'web'` で初期化（既存ユーザーの Web 体験を壊さない）

### 3.2 Repository

`EdgeTokenRepository.create` に `channel` 引数を追加。

### 3.3 トークン発行元（channel の書き分け）

| 発行箇所 | ファイル | channel |
|---|---|---|
| 初回書き込み（Web API経由） | `auth-service.ts` > `issueEdgeToken` | 呼び出し元から渡す |
| 初回書き込み（bbs.cgi経由） | 同上 | 呼び出し元から渡す |
| メール本登録 | `registration-service.ts` > `registerWithEmail` | `web` |
| メールログイン | `registration-service.ts` > `loginWithEmail` | `web` |
| Discord本登録 | `registration-service.ts` > `registerWithDiscord` | `web` |
| Discordログイン | `registration-service.ts` > `loginWithDiscord` | `web` |
| PAT認証（専ブラ） | `registration-service.ts` > `loginWithPat` | `senbra` |

`issueEdgeToken` は Web API ルート・bbs.cgi ルートの両方から呼ばれるため、呼び出し元が channel を渡す設計にする。

### 3.4 Web API ガード

以下のルートに `channel = 'web'` チェックを追加:

- `/api/mypage` (GET)
- `/api/mypage/history` (GET)
- `/api/mypage/theme` (PUT)
- `/api/mypage/username` (PUT)
- `/api/mypage/upgrade` (POST)
- `/api/mypage/vocabularies` (PUT)
- `/api/mypage/copipe/*`
- `/api/auth/pat` (GET, POST)

実装方法: `AuthService.verifyEdgeToken` の戻り値に `channel` を含め、各ルートでチェック。

### 3.5 テスト

上記の変更に対応するユニットテストの修正。

## 4. 実装ステップとチェックポイント

### Step 1: DB マイグレーション + Repository

作業内容:
- マイグレーション SQL 作成（`ALTER TABLE edge_tokens ADD COLUMN channel ...`）
- `EdgeTokenRepository` の型定義・create 関数に `channel` 引数追加
- `EdgeTokenRepository` のテスト修正

**チェックポイント 1（人間）**: ローカル DB にマイグレーション適用後、既存の Web・ChMate 動作が壊れていないことを確認。この時点では channel を書き分けないため、全て `'web'`（デフォルト値）で動作する。

### Step 2: 発行元の書き分け

作業内容:
- `issueEdgeToken` に `channel` 引数追加
- `PostService.resolveAuth` → `issueEdgeToken` 呼び出し箇所で channel を渡す
  - Web API ルート (`/api/threads/*/posts`, `/api/threads`) → `'web'`
  - bbs.cgi ルート → `'senbra'`
- `registration-service.ts` の各関数で channel を設定
  - `loginWithPat` → `'senbra'`
  - それ以外 → `'web'`
- テスト修正

**チェックポイント 2（人間・専ブラ実機）**:
- [ ] ChMate から新規認証 → 書き込みが正常に動作する
- [ ] ChMate から PAT 認証 → 書き込みが正常に動作する
- [ ] Web UI から新規認証 → 書き込みが正常に動作する
- [ ] Web UI から本登録・ログインが正常に動作する
- [ ] DB 上で channel が正しく書き分けられている

### Step 3: Web API ガード

作業内容:
- `verifyEdgeToken` の戻り値に `channel` を追加
- `/api/mypage/*`, `/api/auth/pat` の各ルートで `channel !== 'web'` → 403 を返す
- テスト追加（senbra トークンで mypage API が 403 になること）

**チェックポイント 3（人間・専ブラ実機）**:
- [ ] Web UI でマイページが正常に表示される
- [ ] Web UI で PAT 取得・再発行が正常に動作する
- [ ] ChMate のみで認証したトークンではマイページ API が拒否される
- [ ] ChMate からの書き込みは引き続き正常に動作する

## 5. 既存ユーザーの移行

- マイグレーションで `DEFAULT 'web'` を設定するため、既存レコードは全て `channel = 'web'` になる
- 既存ユーザーの Web 体験は変わらない
- 既存の ChMate ユーザーが保持するトークンも `'web'` のまま残る（権限が現状維持されるだけで、セキュリティは悪化しない）
- 以後、ChMate で再認証（PAT認証等）すると新トークンが `'senbra'` で発行される。その時点から分離が効く

## 6. 後続作業

- [ ] D-07（アーキテクチャ設計書）に TDR として記録
- [ ] D-08（認証コンポーネント設計書）を改訂
- [ ] 課金フェーズで完全分離（別テーブル・別サービス）を再検討
