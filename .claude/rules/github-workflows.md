---
paths:
  - ".github/workflows/*.yml"
  - ".github/workflows/*.yaml"
---

## CI Failure Notifier との同期

`.github/workflows/` にワークフローを追加・削除・リネームした場合、
`ci-failure-notifier.yml` の `workflows:` リストも必ず同期すること。

```yaml
# ci-failure-notifier.yml 内の対象リスト
on:
  workflow_run:
    workflows:
      - "Bot Scheduler"
      - "Daily Maintenance"
      - "Apply DB Migrations"
      - "Seed Pinned Thread"
      # ← 新規ワークフローの name: をここに追加
```

リスト内の値はファイル名ではなく、各ワークフローの `name:` フィールドの値を使用する。
