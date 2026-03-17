# 方針: 撃破済みボット表示のテスト戦略

> 決定日: 2026-03-17

## 対象シナリオ

- `features/bot_system.feature` — 撃破済みボットのレスはWebブラウザで目立たない表示になる
- `features/bot_system.feature` — 撃破済みボットのレス表示をトグルで切り替えられる

## 現状

- サービス層（撃破済みフラグ、状態遷移）は実装・テスト済み
- UIコンポーネント（React側の表示ロジック）が未実装
- Cucumberステップ定義は `return "pending"` で意図的スキップ中

## 方針

**案B: Cucumberは永久pendingとし、Vitestコンポーネントテスト（Testing Library）で独立検証する**

### 理由

1. BDDテスト全体がサービス層インメモリで統一されており、1箇所だけReact依存を混ぜると実行環境が複雑化する
2. 検証対象がDOM操作のみ（CSSクラス付与・表示切替）であり、E2Eは過剰
3. コンポーネントテストは高速・安定でCIにも適する

### 実装時の作業

1. Reactコンポーネント実装（撃破済みボットの薄い文字色 + トグルUI）
2. Vitestコンポーネントテスト作成: `src/__tests__/app/(web)/thread/eliminated-bot-display.test.tsx`
3. Cucumberステップ定義のコメントに「Vitestコンポーネントテストで検証済み」と追記（pendingは維持）
