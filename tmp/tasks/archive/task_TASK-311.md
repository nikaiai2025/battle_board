---
task_id: TASK-311
sprint_id: Sprint-114-hotfix
status: completed
assigned_to: bdd-architect
artifacts_dir: tmp/workers/bdd-architect_TASK-311
depends_on: []
created_at: 2026-03-25T03:30:00+09:00
updated_at: 2026-03-25T03:30:00+09:00
locked_files: []
---

## タスク概要

`loginWithEmail` の実装におけるセキュリティレビュー。サービス層が `@supabase/supabase-js` の `createClient` を直接呼んで使い捨てクライアントを生成している設計について、セキュリティ上の問題がないかを評価する。

## レビュー対象

1. `src/lib/services/registration-service.ts` の `loginWithEmail` 関数（L212-247）
2. `src/lib/infrastructure/supabase/client.ts`（既存のクライアント定義）

## レビュー観点

### 1. セキュリティ観点（最優先）
- 使い捨てクライアント（anon key + `persistSession: false`）で `signInWithPassword` を呼ぶ設計は安全か？
- `supabaseAdmin`（service_role key）のセッション汚染回避という意図は妥当か？
- Cloudflare Workers（ステートレス実行モデル）において、シングルトンのセッション汚染は実際に起こりうるか？
- anon keyの認証クライアントとservice_role keyのDB操作クライアントの分離は、Supabase公式推奨パターンに沿っているか？

### 2. テスタビリティ・アーキテクチャ観点
- サービス層が `@supabase/supabase-js` を直接importしている依存方向の問題
- `client.ts` にファクトリ関数 `createAuthOnlyClient()` を追加する修正方針の妥当性
- この修正でテスト失敗（vitest 4件 + BDD 4件 = 計8件）が解消されるか

### 3. 横展開
- 他のサービスに同様のパターン（サービス層から外部ライブラリ直接import）がないか簡易確認

## 必読ドキュメント
1. [必須] `src/lib/services/registration-service.ts` — 対象コード
2. [必須] `src/lib/infrastructure/supabase/client.ts` — 既存クライアント定義
3. [参考] `src/__tests__/lib/services/registration-service.test.ts` — テスト（失敗箇所）
4. [参考] `docs/architecture/components/user-registration.md` — コンポーネント設計
5. [参考] `docs/architecture/architecture.md` — アーキテクチャ制約

## 出力（artifacts_dir に生成）
- `security_review_loginWithEmail.md` — レビュー結果と推奨修正方針

## 完了条件
- [ ] セキュリティ上の問題有無を明確に判定
- [ ] 推奨修正方針を提示（修正不要の場合はその根拠）
- [ ] 横展開確認結果を記載

## スコープ外
- コード修正（本タスクはレビューのみ）

## 作業ログ
<!-- ワーカーAIが以下に追記 -->

### チェックポイント
- 状態: 完了
- 完了済み: セキュリティレビュー、テスト失敗分析、横展開確認
- 次にすべきこと: なし（レビュー完了。修正実装は別タスク）
- 未解決の問題: なし

### 進捗ログ

#### 2026-03-25 レビュー実施

**調査内容:**
1. `registration-service.ts` loginWithEmail (L212-247) の設計レビュー
2. `client.ts` のシングルトン定義確認
3. `admin-user-repository.ts` の先行事例（createAuthClient）確認
4. vitest 4件失敗 + BDD 4件失敗の原因特定
5. Supabase 公式推奨パターンの調査（Discussion #30739 等）
6. Cloudflare Workers のモジュールスコープ仕様確認
7. 横展開: `@supabase/supabase-js` 直接 import 箇所の全数確認（3箇所）

**結論:**
- セキュリティ: 問題なし（anon key + persistSession:false は Supabase 推奨パターン合致）
- アーキテクチャ: 要修正（Service 層から外部ライブラリ直接 import はレイヤー規約違反）
- テスト失敗: client.ts にファクトリ関数 `createAuthOnlyClient()` を追加し、registration-service.ts の直接 import を除去すれば解消

**成果物:** `tmp/workers/bdd-architect_TASK-311/security_review_loginWithEmail.md`
