# Yomiage 運用ランブック

## 目的

`!yomiage` の定常運用と障害対応の手順を定義する。対象は GitHub Actions `Yomiage Scheduler`、Vercel Internal API、Gemini TTS、音声配信ストレージの連携一式。

関連資料:

- `docs/architecture/components/yomiage.md`
- `docs/architecture/architecture.md` §13 TDR-018
- `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md` §5.2

## 監視対象

### GH Actions `Yomiage Scheduler` 成功率

- 監視対象: GitHub Actions ワークフロー `Yomiage Scheduler`
- 期待値: 直近24時間の成功率 95%以上
- 確認方法:
  - GitHub Actions のワークフロー履歴を確認する
  - `CI Failure Notifier` で `ci-failure` Issue が起票されていないか確認する

### pending 滞留

- 監視対象: `pending_async_commands` の `command_type = 'yomiage'`
- 異常目安: 1時間以上滞留、または同一 `pendingId` が複数回の worker 実行後も残存
- 確認方法:
  - `GET /api/internal/yomiage/pending` を Internal API 認証付きで確認する
  - pending 件数と `createdAt` を見て、古いエントリが溜まっていないか確認する

### Litterbox 応答

- 監視対象: upload 成功率、応答時間、非200応答の有無
- 期待値:
  - 成功率 95%以上
  - p95 応答時間 10秒未満
- 補足: `tmp/workers/bdd-architect_LITTERBOX_ADOPTION/litterbox_api_handoff.md` §5.2 の監視方針に従う

## 障害対応手順

### Gemini TTS 障害

症状:

- `Yomiage Scheduler` が `stage=tts` で継続的に失敗する
- 完了通知では通貨返却済みだが、音声URLが一切投稿されない

一次対応:

1. GitHub Actions の失敗ログで Gemini API エラー内容を確認する
2. API キー切れ・429・500 系が継続しているかを判定する
3. 長期障害と判断した場合は `config/commands.yaml` の `commands.yomiage.enabled` を `false` に変更してデプロイする

停止手順:

1. `config/commands.yaml` を開く
2. `commands.yomiage.enabled: true` を `false` に変更する
3. 通常のデプロイ手順で本番反映する
4. 反映後に `!yomiage` が新規受付されないことを確認する

復旧後:

1. 原因が解消したことを確認する
2. `commands.yomiage.enabled` を `true` に戻す
3. `Yomiage Scheduler` を手動実行し、成功ログを確認する

### Litterbox 障害

症状:

- `stage=upload` が継続的に失敗する
- Litterbox から非200または URL 以外のレスポンスが返る

一次対応:

1. GitHub Actions ログで `upload` 失敗の比率とメッセージを確認する
2. 一時障害か継続障害かを切り分ける
3. 継続障害なら `!yomiage` を停止するか、TDR-018 の移行条件に該当するかを判断する

恒久対応:

- `docs/architecture/architecture.md` §13 TDR-018 の移行条件を確認する
- 条件に該当する場合は Cloudflare R2 への移行手順を起票・実施する
- 切替時の変更点は `scripts/yomiage-worker.ts` と GitHub Secrets に閉じる

### pending 詰まり

症状:

- `GET /api/internal/yomiage/pending` に古い pending が残り続ける
- `Yomiage Scheduler` 実行後も queue が減らない

確認手順:

1. `BOT_API_KEY` 付きで `GET /api/internal/yomiage/pending` を呼び、対象 `pendingId` を特定する
2. 同じ `threadId` と `targetPostNumber` で `GET /api/internal/yomiage/target` を呼び、対象レスの状態を確認する
3. GH Actions ログに対応する `pendingId` の処理履歴があるか確認する

手動回収手順:

1. 失敗扱いにする場合は `POST /api/internal/yomiage/complete` を手動送信する
2. 送信ボディ例:

```json
{
  "pendingId": "対象pendingId",
  "threadId": "対象threadId",
  "invokerUserId": "対象userId",
  "targetPostNumber": 5,
  "success": false,
  "error": "manual recovery",
  "amount": 30
}
```

3. 実行後、★システムレス投稿と通貨返却、pending 削除が行われたことを確認する

注意:

- `amount` は `config/commands.yaml` の `commands.yomiage.cost` と一致させる
- 失敗ステージが明確なら `stage: "tts" | "compress" | "upload"` を追加してよい

## 定常確認

- `CI Failure Notifier` に `Yomiage Scheduler` の失敗 Issue がないこと
- `GET /api/internal/yomiage/pending` が通常時に空、または短時間で解消すること
- 掲示板上の ★システムレスに URL 行と有効期限注意書きが含まれること
