---
task_id: TASK-052
sprint_id: Sprint-19
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T03:00:00+09:00
updated_at: 2026-03-15T03:00:00+09:00
locked_files:
  - src/lib/services/auth-service.ts
  - src/lib/services/__tests__/auth-service.test.ts
  - src/lib/infrastructure/adapters/bbs-cgi-response.ts
  - src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts
---

## タスク概要

write_tokenをワンタイム消費から永続化（30日有効）に変更する。ChMateユーザーがmail欄に `sage#<write_token>` を入れ続ける限り認証が有効になるようにする。

**背景**: ChMateはbbs.cgiレスポンスのSet-Cookieヘッダからedge-token Cookieを保持しない。現行のwrite_tokenはワンタイム（1回使用で無効化）かつ有効期限10分のため、毎回認証コードの取得が必要になっている。

**修正方針**（アーキテクト分析: `tmp/workers/bdd-architect_TASK-052/analysis.md` §5 案G）:
1. `verifyWriteToken()` から `clearWriteToken()` 呼び出しを削除（ワンタイム消費廃止）
2. `verifyAuthCode()` でwrite_tokenの有効期限を10分→30日に変更
3. `buildAuthRequired()` の案内文にwrite_token永続利用の説明を追記

## 対象BDDシナリオ
- `features/constraints/specialist_browser_compat.feature` @認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
- `features/constraints/specialist_browser_compat.feature` @無効なwrite_tokenでは書き込みが拒否される

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/services/auth-service.ts` — 修正対象（verifyWriteToken, verifyAuthCode）
2. [必須] `tmp/workers/bdd-architect_TASK-052/analysis.md` — アーキテクト分析（§4.3, §5 を参照）
3. [参考] `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — buildAuthRequired案内文修正

## 出力（生成すべきファイル）
- `src/lib/services/auth-service.ts` — verifyWriteToken/verifyAuthCode修正
- `src/lib/services/__tests__/auth-service.test.ts` — ワンタイムテスト→永続化テストに書き換え
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — buildAuthRequired案内文更新
- `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts` — 案内文テスト更新（必要に応じて）

## 完了条件
- [ ] `verifyWriteToken()` から `clearWriteToken()` 呼び出しが削除されている
- [ ] `verifyWriteToken()` のJSDocコメントからワンタイム関連の記述を削除
- [ ] `verifyAuthCode()` で write_token の有効期限が30日（`30 * 24 * 60 * 60 * 1000`）
- [ ] `buildAuthRequired()` の案内文にwrite_token永続利用の案内を追記（例: 「※ このコードはメール欄に入れたままにしてください（30日間有効）」）
- [ ] 単体テスト: write_tokenが2回使用しても有効であることを検証
- [ ] 単体テスト: write_tokenの有効期限が30日であることを検証
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- 書き込み確認フロー（`<title>書き込み確認</title>`）の実装（将来のPhase 2）
- BDDシナリオの変更
- bbs.cgi route.tsの変更
- /auth/verify ページのUI変更（TASK-053で対応）

## 補足・制約

### 具体的な変更箇所

**auth-service.ts > verifyWriteToken() (L354-386):**
```typescript
// 削除: Step 3のclearWriteToken呼び出し（L374-376）
// await AuthCodeRepository.clearWriteToken(authCode.id)  // ← この行を削除
```

**auth-service.ts > verifyAuthCode() (L331):**
```typescript
// 変更前:
const writeTokenExpiresAt = new Date(Date.now() + 600 * 1000) // 10分後

// 変更後:
const writeTokenExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30日後
```

**bbs-cgi-response.ts > buildAuthRequired():**
案内文の手順3の後に以下を追記:
```
※ write_tokenはメール欄に入れたままにしてください（30日間有効）。<br>
例: sage#write_token値<br>
```

### セキュリティ考慮事項
- write_tokenは32文字hex（128bitエントロピー）で十分な強度がある
- mail欄のwrite_tokenはDAT出力時に除去されるため他ユーザーには漏洩しない
- 1つのwrite_tokenは1つのedge-tokenに紐づくため使い回し不可

## 作業ログ
<!-- ワーカーAIが以下に追記。オーケストレーターは上記セクションのみ編集 -->

### チェックポイント
- 状態: completed
- 完了済み: 全修正完了、全テストPASS
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ
- [開始] 必読ドキュメント読み込み完了。変更箇所を特定済み
- [実装] auth-service.ts: verifyAuthCode() の write_token 有効期限を10分→30日に変更
- [実装] auth-service.ts: verifyWriteToken() から clearWriteToken() 呼び出しを削除（ワンタイム消費廃止）
- [実装] auth-service.ts: JSDocコメントをワンタイム→永続化に更新
- [実装] bbs-cgi-response.ts: buildAuthRequired() の案内文に「30日間有効」のメール欄継続利用案内を追記
- [実装] auth-service.test.ts: ワンタイムテスト→永続化テストに書き換え（2回使用しても有効なテスト追加）
- [実装] auth-service.test.ts: verifyAuthCode() の write_token 30日有効期限テストを追加
- [実装] bbs-cgi-response.test.ts: 「30日間有効」案内文のテストを追加
- [確認] npx vitest run: 590テスト全PASS
- [確認] npx cucumber-js: 95シナリオ全PASS

### テスト結果サマリー
- 単体テスト (vitest run): 590 tests, 18 test files — 全PASS
- BDDテスト (cucumber-js): 95 scenarios, 454 steps — 全PASS
- 対象BDDシナリオ確認済み:
  - `認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する` — PASS
  - `無効なwrite_tokenでは書き込みが拒否される` — PASS
