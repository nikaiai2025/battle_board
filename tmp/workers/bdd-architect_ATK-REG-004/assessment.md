# ATK-R004-1 アーキテクト評価

## 判定: 対応推奨

## 問題の実在確認

確認済み。以下の2箇所で PAT 平文が JSON レスポンスに含まれている。

- `src/lib/services/mypage-service.ts:264` -- `patToken: user.patToken` を MypageInfo に含める
- `src/app/api/mypage/route.ts:81` -- `NextResponse.json(mypageInfo, { status: 200 })` でそのまま返却

`GET /api/mypage` を呼ぶだけで、レスポンス JSON の `patToken` フィールドから PAT が読み取れる。

## CR-002 との整合性

矛盾がある。CR-002 は以下の設計判断に基づき `authToken`（edge-token）を MypageInfo から除去した:

> authToken（edge-token）はセキュリティ上の理由からレスポンスに含めない。クライアントはCookieを通じて自動送信されるため、JSONレスポンスでの返却は不要。
> -- mypage-service.ts:39-41

PAT は edge-token を再発行できる認証資格情報であり（`user_registration.feature:189-192`）、edge-token と同等以上の保護が必要。CR-002 で edge-token を除去した方針が PAT に適用されていないのは設計上の不整合。

## 「対応必須」でなく「対応推奨」とする根拠

PAT の性質上、XSS に対する完全な防御は不可能であり、リスク低減のみが現実的に達成できる。

1. **PAT はユーザーが手動コピーする必要がある**: BDD シナリオ「マイページで PAT を確認できる」は PAT 全文の UI 表示を求めている。ユーザーが PAT をコピーして専ブラに設定する以上、JavaScript からアクセス可能な形で PAT がブラウザ上に存在することは避けられない

2. **専用エンドポイントが既に存在する**: `/api/auth/pat`（GET）が PAT 取得専用のエンドポイントとして実装済み。`/api/mypage` から PAT を除外しても、XSS 攻撃者は `fetch('/api/auth/pat')` で PAT を取得可能。エンドポイント分離だけでは根本解決にならない

3. **既存の緩和策が存在する**: PAT 再発行機能が実装済み（`POST /api/auth/pat`）であり、漏洩時にユーザーが PAT を無効化できる

つまり、この修正は攻撃面の縮小（リスク低減）には有効だが、XSS が発生した場合の PAT 奪取を根絶するものではない。

## 修正方針

### 方針: `/api/mypage` レスポンスから `patToken` を除外し、PAT 表示を専用エンドポイントに限定する

**変更箇所:**

| ファイル | 変更内容 |
|---|---|
| `src/lib/services/mypage-service.ts` | MypageInfo から `patToken` を削除。`patLastUsedAt` は残してよい（非機密情報） |
| `src/app/(web)/mypage/page.tsx` | PAT セクションの表示データを `/api/auth/pat` から別途取得するように変更 |

**変更しない箇所:**

- `GET /api/auth/pat` -- PAT 取得の専用エンドポイントとしてそのまま使用。認証必須・本登録ユーザー限定の現行設計は適切
- BDD シナリオ -- 「マイページで PAT を確認できる」の振る舞いは変わらない（データ取得元が変わるだけ）
- `POST /api/auth/pat` -- PAT 再発行は現行のまま

**効果:**

- `/api/mypage` は頻繁にアクセスされる汎用エンドポイント。ここから PAT を除外することで、不必要に PAT が流通する経路を1つ閉じる
- PAT 取得が `/api/auth/pat` に集約され、アクセスログの監査が容易になる
- CR-002 の設計方針（認証資格情報を汎用 API レスポンスに含めない）との整合性が回復する

**補足 -- XSS 耐性を高める追加施策（本件スコープ外）:**

本件の修正だけでは XSS 経由の PAT 奪取は防げない。より本質的な防御として以下が有効だが、本評価のスコープ外とする:

- CSP（Content Security Policy）の厳格化
- PAT への有効期限の導入
- PAT 使用時の rate limiting・異常検知
