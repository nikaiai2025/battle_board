---
task_id: TASK-219
sprint_id: Sprint-79
status: assigned
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-219
depends_on: []
created_at: 2026-03-21T22:00:00+09:00
updated_at: 2026-03-21T22:00:00+09:00
locked_files: []
---

## タスク概要
撃破済みBOT表示機能の設計書を作成する。バックエンドでのbotMarkデータ取得（posts + bot_posts + bots JOIN）、フロントエンドでの表示分岐（目立たない表示）、トグルUI（非表示/表示切替）の設計を行う。

## 対象BDDシナリオ
- `features/bot_system.feature` — 撃破済みボットのレスはWebブラウザで目立たない表示になる
- `features/bot_system.feature` — 撃破済みボットのレス表示をトグルで切り替えられる

## 必読ドキュメント（優先度順）
1. [必須] `features/bot_system.feature` — 撃破済みBOT表示の2シナリオ
2. [必須] `src/lib/infrastructure/repositories/post-repository.ts` — 現在のレス取得実装
3. [必須] `src/lib/infrastructure/repositories/bot-post-repository.ts` — bot_posts テーブル操作
4. [必須] `src/lib/domain/models/post.ts` — Post ドメインモデル（botMark未定義）
5. [必須] `src/lib/domain/models/bot.ts` — Bot ドメインモデル（isActive, hp, maxHp）
6. [必須] `src/app/(web)/_components/PostItem.tsx` — PostItem UIコンポーネント（botMark interface あり）
7. [必須] `src/app/(web)/[boardId]/[threadKey]/[[...range]]/page.tsx` — スレッドページSSR
8. [必須] `src/app/(web)/_components/PostList.tsx` — PostList コンポーネント
9. [必須] `src/app/(web)/_components/PostListLiveWrapper.tsx` — ポーリング新着表示
10. [必須] `e2e/flows/bot-display.spec.ts` — E2Eテスト（test.fixme、実装後に有効化）
11. [必須] `docs/specs/openapi.yaml` — Post.botMark 定義（105行目付近）
12. [参考] `src/lib/services/post-service.ts` — PostService（getPostList等）
13. [参考] `docs/architecture/architecture.md` — §10.1.1 RLSポリシー設計

## 出力（生成すべきファイル）
- `tmp/workers/bdd-architect_TASK-219/design.md` — 撃破済みBOT表示の設計書

## 設計すべき項目

### 1. データフロー設計
- PostRepository.findByThreadId() でbot_posts + bots をJOINして botMark を取得する方法
  - LEFT JOIN方式 vs 2段階クエリ（レス取得後にbot_postsを一括検索）のトレードオフ
  - Supabase REST APIの制約（foreign key relationship、nested select等）を考慮
- Post ドメインモデルへの botMark 追加の是非（または PostService での合成）
- **セキュリティ制約**: 撃破済みBOT（is_active=false）のみ botMark を含める。活動中BOTの情報は絶対に漏洩させない

### 2. フロントエンド表示設計
- PostItem.tsx での目立たない表示の実装方法（opacity, text-gray-400, etc.）
  - E2Eテスト(bot-display.spec.ts)がopacity < 1 をアサートしている点に注意
- article要素全体 vs 本文のみへのスタイル適用判断

### 3. トグルUI設計
- BDDシナリオ: 「全体メニューの「撃破済みBOTレス表示」トグルをOFFにする」
  - data-testid="eliminated-bot-toggle" がE2Eテストから参照される
- トグル配置場所（スレッドヘッダ内? 独立コンポーネント?）
- 状態管理方式（React useState? Context?）
  - PostListとPostListLiveWrapperの両方がトグル状態を参照する必要がある
  - PostList: SSR初期レス、PostListLiveWrapper: ポーリング新着レス
- トグルOFF時の挙動: display:none vs visibility:hidden vs 条件レンダリング

### 4. SSRデータフロー
- page.tsx の fetchThreadDetail() で botMark を含める方法
- Post型（PostItem.tsx）に既にbotMarkがある → UI側の型変更は不要
- Server Component → Client Component のデータ受け渡し

### 5. テスト方針
- 単体テスト: PostRepository（botMarkが含まれること）、PostItem（botMarkでスタイル変化）
- bot-display.spec.ts のtest.fixme()を外す条件

## 完了条件
- [x] `tmp/workers/bdd-architect_TASK-219/design.md` に上記5項目の設計が記載されている
- [x] セキュリティ考慮（活動中BOT非漏洩）が明記されている
- [x] E2Eテスト（bot-display.spec.ts）との整合性が確認されている

## スコープ外
- featureファイルの変更
- OpenAPI仕様の変更（botMarkは既に定義済み）
- 実装コーディング（TASK-220で実施）

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: 完了
- 完了済み: 設計書作成、自己反省実施
- 次にすべきこと: TASK-220（実装）に引き継ぎ
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-21 読み込み・設計・作成

1. タスク指示書の必読ドキュメント13件を全て読み込み
2. 設計書 `tmp/workers/bdd-architect_TASK-219/design.md` を作成
   - 5項目（データフロー、フロントエンド表示、トグルUI、SSRデータフロー、テスト方針）を網羅
   - セキュリティ制約（活動中BOT非漏洩）を明記
   - E2Eテスト(bot-display.spec.ts)との整合性を確認・記載
3. 自己反省を実施。主要な設計判断6箇所を振り返り、全て妥当と判断
   - page.tsx内のProvider配置構造の記述をより明確に修正（thread-headerとProviderの位置関係）
4. E2Eフィクスチャの不備を発見・記載: `seedEliminatedBotThreadLocal()`にbot_postsテーブルへのINSERTが欠落。TASK-220で修正要
