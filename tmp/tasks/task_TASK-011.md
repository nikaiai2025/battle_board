---
task_id: TASK-011
sprint_id: Sprint-6
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-09T14:00:00+09:00
updated_at: 2026-03-09T14:00:00+09:00
locked_files:
  - "[NEW] src/lib/services/incentive-service.ts"
  - "[NEW] src/lib/services/__tests__/incentive-service.test.ts"
---

## タスク概要
IncentiveServiceを実装する。8種のボーナスイベントの発火判定・通貨付与（CurrencyService.credit）・ログ記録（IncentiveLogRepository.create）を統括するサービス層。
ドメイン層の純粋関数（incentive-rules.ts）は実装済みであり、本タスクではそれらを組み合わせたオーケストレーションを実装する。
遅延評価型ボーナス（hot_post, thread_revival, thread_growth）は後続書き込み時に過去レスを検索して判定する。

## 対象BDDシナリオ
- `features/phase1/incentive.feature` — 全30シナリオ
- NOTE: BDDステップ定義は本タスクのスコープ外

## 必読ドキュメント（優先度順）
1. [必須] `docs/architecture/components/incentive.md` — 公開インターフェース（evaluateOnPost / PostContext / IncentiveResult）・依存関係・設計判断
2. [必須] `src/lib/domain/rules/incentive-rules.ts` — 純粋関数群（shouldGrantDailyLogin, calcThreadGrowthBonus, shouldGrantReplyBonus, shouldGrantHotPostBonus, shouldGrantNewThreadJoinBonus, shouldGrantThreadRevivalBonus, calcStreakBonus, updateStreakDays, calcMilestonePostBonus）
3. [必須] `src/lib/domain/models/incentive.ts` — PostContext, IncentiveResult, IncentiveLog, IncentiveEventType 型定義
4. [必須] `src/lib/infrastructure/repositories/incentive-log-repository.ts` — create（ON CONFLICT DO NOTHING）, findByUserIdAndDate
5. [必須] `src/lib/services/currency-service.ts` — credit（通貨付与）
6. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — findByThreadId（遅延評価用）
7. [必須] `src/lib/infrastructure/repositories/thread-repository.ts` — findById（スレッド情報取得）
8. [必須] `src/lib/infrastructure/repositories/user-repository.ts` — findById, updateStreak
9. [必須] `src/lib/domain/rules/anchor-parser.ts` — parseAnchors（アンカー解析）
10. [参考] `features/phase1/incentive.feature` — BDDシナリオ（仕様の正本）
11. [参考] `src/lib/domain/models/currency.ts` — CreditReason型

## 入力（前工程の成果物）
- `src/lib/domain/rules/incentive-rules.ts` — 純粋判定関数群（Sprint-2）
- `src/lib/infrastructure/repositories/incentive-log-repository.ts` — IncentiveLogRepository（Sprint-3）
- `src/lib/services/currency-service.ts` — CurrencyService（Sprint-5 TASK-008）

## 出力（生成すべきファイル）

### `src/lib/services/incentive-service.ts`
インセンティブ統括サービス。incentive.md §2 の公開インターフェースに準拠。

**メイン関数:**
- `evaluateOnPost(ctx: PostContext): Promise<IncentiveResult>` — 書き込み時にすべてのボーナスイベントを判定・付与する。以下の順序で判定:

**同期判定（書き込み時点で確定）:**
1. `daily_login` — 当日初書き込みか（lastPostDate !== todayJst）→ +10。shouldGrantDailyLogin使用
2. `thread_creation` — スレッド作成時の初回か → +10。shouldGrantThreadCreationBonus使用。※PostContextにisThreadCreationフラグが必要（PostContext拡張 or 別パラメータ）
3. `reply` — アンカー先が他者のレスか → +5。shouldGrantReplyBonus使用。同一IDからは1日1回制限（IncentiveLogで重複チェック）
4. `new_thread_join` — そのスレッドへの初書き込みか → +3。shouldGrantNewThreadJoinBonus使用。1日3スレッドまで
5. `streak` — ストリーク日数がマイルストーンに到達 → +20/+100。updateStreakDays + calcStreakBonus使用。UserRepository.updateStreakでDB更新
6. `milestone_post` — レス番号が100の倍数か → +10/+100。calcMilestonePostBonus使用

**遅延評価（後続書き込みにより過去レスの条件が満たされる）:**
7. `hot_post` — 過去60分以内のレスに3人以上返信 → +15。shouldGrantHotPostBonus使用。過去レスを走査
8. `thread_revival` — 24h以上低活性スレッドが復興 → +10。isInactiveThread + shouldGrantThreadRevivalBonus使用
9. `thread_growth` — スレッドがマイルストーン（10件/100件）到達 → +50/+100。calcThreadGrowthBonus使用。ユニークID数はpostsテーブルから集計

**ヘルパー関数:**
- `getTodayJst(): string` — JST日付文字列。PostServiceと同じロジック（共通化検討）
- `countUniqueIds(threadId: string): Promise<number>` — スレッド内のユニーク日次リセットID数を集計

### `src/lib/services/__tests__/incentive-service.test.ts`
IncentiveServiceの単体テスト（モック使用）。主要テストケース:
- evaluateOnPost: daily_login正常系/重複
- evaluateOnPost: reply正常系/自己返信/同一ID重複
- evaluateOnPost: new_thread_join正常系/既参加/日次上限
- evaluateOnPost: streak正常系/マイルストーン/リセット
- evaluateOnPost: milestone_post正常系/非キリ番
- evaluateOnPost: hot_post正常系/時間超過/人数不足
- evaluateOnPost: thread_revival正常系/時間超過/同一ユーザー
- evaluateOnPost: thread_growth正常系/ユニークID不足
- evaluateOnPost: インセンティブ失敗時にエラーログ出力（例外をスローしない）

## 完了条件
- [ ] IncentiveServiceがevaluateOnPostを提供している
- [ ] 同期判定6種（daily_login, thread_creation, reply, new_thread_join, streak, milestone_post）が実装されている
- [ ] 遅延評価3種（hot_post, thread_revival, thread_growth）が実装されている
- [ ] 各ボーナスの付与額がincentive.featureの仕様と一致している
- [ ] IncentiveLogRepository.createで重複防止が機能している
- [ ] CurrencyService.creditで通貨付与している
- [ ] UserRepository.updateStreakでストリーク更新している
- [ ] IncentiveServiceの単体テストが作成されている
- [ ] テストコマンド: `npx vitest run` で全テストPASS

## スコープ外
- BDDステップ定義の実装
- PostServiceへの統合（TASK-012で実施）
- Web UIでのボーナス通知表示
- thread_creationのPostContext拡張はTASK-012で対応（本タスクではisThreadCreation引数を追加パラメータで受け取る設計とする）

## 補足・制約
- IncentiveServiceの例外は呼び出し元でcatchする設計（incentive.md §5）。ただし本タスクのevaluateOnPost内部でも個別ボーナスの失敗をcatch+ログし、他のボーナス判定を継続すること
- 遅延評価ボーナスは「後続書き込みトランザクション内で過去レスをチェックする方式」（TDR-004）
- thread_creationボーナスの判定: evaluateOnPostにオプショナルなisThreadCreation: booleanパラメータを追加して対応（PostContext型は変更不可のため、第2引数として渡す）
- IncentiveLogのcontextDateはJST日付文字列（YYYY-MM-DD）を使用
- contextIdにはスレッドIDまたはレスIDを設定（イベント種別による）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- 2026-03-09: 必読ドキュメント全読了（incentive.md, incentive-rules.ts, incentive.ts, incentive-log-repository.ts, currency-service.ts, post-repository.ts, thread-repository.ts, user-repository.ts, anchor-parser.ts, incentive.feature, currency.ts）
- 2026-03-09: TDD実施 — テストファイル先行作成（RED確認）
- 2026-03-09: incentive-service.ts 実装（同期判定6種 + 遅延評価3種）
- 2026-03-09: 自己返信の skipped 追加漏れを修正（RED→GREEN）
- 2026-03-09: 全テストスイート回帰確認 PASS（321件）

### テスト結果サマリー
- **新規テスト**: 36件 PASS / 0件 FAIL
  - daily_login: 3件（初回・昨日・当日重複）
  - thread_creation: 3件（初回・重複・isThreadCreation=false）
  - reply: 4件（正常・自己返信・重複・isReplyTo未設定）
  - new_thread_join: 3件（正常・既参加・日次上限）
  - streak: 5件（7日目・30日目・リセット・同日2回目・updateStreak呼出し）
  - milestone_post: 4件（100番・1000番・非キリ番50・非キリ番1）
  - hot_post: 3件（正常・時間超過・人数不足）
  - thread_revival: 4件（正常・followup無し・24h以内・自己返信）
  - thread_growth: 3件（10件+50・100件+100・ID不足）
  - 複合テスト・構造検証・エラーハンドリング: 4件
- **全テストスイート**: 321件 PASS / 0件 FAIL（8テストファイル）
