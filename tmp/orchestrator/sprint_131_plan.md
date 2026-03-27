# Sprint-131 計画書

## 目的

1. `!hiroyuki` E2Eスモークテストの誤アサーション修正
2. `!omikuji` v3 改修の完了とテスト確認

## 背景

### hiroyuki E2Eテスト問題
Sprint-130 のスモークテスト（TASK-SMOKE-130）で `!hiroyuki` テストが FAIL。
調査の結果、テストが `-10`（通貨消費表示）を期待していたが、hiroyuki handler は `systemMessage: null` を返し、
`post-service.ts` は `currencyCost` を `inlineSystemInfo` に変換するロジックを持たないため、
`-10` は本来生成されない。E2Eテストのアサーションが誤り。

### omikuji v3
前セッションで `!omikuji` の表示方式変更（独立システムレス → レス内マージ、>>N → dailyId表示）が
コード・テスト・ステップ定義まで完了しているが、未コミット。
`basic-flow.spec.ts` のomikujiテストも v3 に合わせた更新が必要。

## タスク

| TASK_ID | 内容 | 担当 | 依存 | 状態 |
|---|---|---|---|---|
| TASK-339 | E2Eテスト修正（hiroyuki + omikuji v3） + 全テスト確認 | bdd-coding | なし | assigned |

### locked_files

**TASK-339:**
- `e2e/flows/basic-flow.spec.ts`

※ omikuji のソースコード変更（handler, test, steps, command-service, commands.yaml）は既に
ワーキングツリーに存在するため locked_files に含めない（TASK-339 は E2E のみ変更）。

## 結果

<!-- ワーカー完了後に追記 -->
