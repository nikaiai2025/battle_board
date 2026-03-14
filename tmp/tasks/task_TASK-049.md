---
task_id: TASK-049
sprint_id: Sprint-18
status: completed
assigned_to: bdd-coding
depends_on: []
created_at: 2026-03-15T01:00:00+09:00
updated_at: 2026-03-15T01:00:00+09:00
locked_files:
  - src/lib/services/auth-service.ts
  - src/lib/services/post-service.ts
  - src/lib/services/__tests__/auth-service.test.ts
  - src/lib/services/__tests__/post-service.test.ts
---

## タスク概要

`verifyEdgeToken` からIPチェック（`user.authorIdSeed !== ipHash` 比較）を削除し、`resolveAuth` の `ip_mismatch` 分岐を簡素化する。

背景: ChMateで write_token 認証成功後にメアド欄を空にして再書き込みすると再認証に飛ばされる。eddistの参考実装に倣い、投稿時のIP一致チェックを廃止して「edge-tokenの存在 + is_verified=true」のみで認証判定する設計に変更する。

## 対象BDDシナリオ
- `features/phase1/authentication.feature` @認証済みユーザーのIPアドレスが変わっても書き込みが継続できる
- `features/constraints/specialist_browser_compat.feature` @Cookie共有の専ブラでは認証後そのまま書き込みできる

## 必読ドキュメント（優先度順）
1. [必須] `src/lib/services/auth-service.ts` — verifyEdgeToken修正対象
2. [必須] `src/lib/services/post-service.ts` — resolveAuth簡素化対象
3. [必須] `tmp/workers/bdd-architect_TASK-048/analysis.md` — アーキテクト分析（問題2の修正方針）
4. [参考] `docs/research/eddist_edge_token_ip_report_2026-03-14.md` — eddist参考実装（IPチェック不要の根拠）

## 出力（生成すべきファイル）
- `src/lib/services/auth-service.ts` — verifyEdgeTokenからIPチェック削除、VerifyResult型からip_mismatch削除
- `src/lib/services/post-service.ts` — resolveAuthのip_mismatch分岐削除
- `src/lib/services/__tests__/auth-service.test.ts` — ip_mismatchテストを「IP変更時も成功する」テストに書き換え
- `src/lib/services/__tests__/post-service.test.ts` — ip_mismatch関連テストの更新

## 完了条件
- [ ] `verifyEdgeToken` が edge-token存在 + is_verified のみで判定する（IPチェックなし）
- [ ] `VerifyResult` 型から `ip_mismatch` reason を削除
- [ ] `resolveAuth` から `ip_mismatch` 分岐（L160-181相当）を削除
- [ ] 単体テスト: 異なるIPでもis_verified=trueなら認証成功することを検証
- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS

## スコープ外
- Shift-JIS文字化け修正（TASK-048で対応）
- BDDシナリオの変更
- bbs.cgi route の変更

## 補足・制約
- `verifyEdgeToken` のシグネチャ `(token: string, ipHash: string)` は後方互換のため維持し、ipHashパラメータは未使用とする（呼び出し元の変更を最小化）
- `authorIdSeed` フィールドはユーザー作成時に固定されるため（日次リセットID生成に使用）、IPチェック削除の影響を受けない
- BDDのip_mismatch関連ステップ定義も更新が必要な場合がある

## 作業ログ

### チェックポイント
- 状態: completed
- 完了済み: 全作業完了
- 次にすべきこと: なし
- 未解決の問題: なし

### 進捗ログ

- auth-service.ts: VerifyResult 型から ip_mismatch 削除、verifyEdgeToken から IP チェック削除
- post-service.ts: resolveAuth の ip_mismatch 分岐（旧 L160-181 相当）削除
- auth-service.test.ts: IP不一致テストを「IP変更時も valid: true を返す」テストに書き換え（モバイル回線テスト追加）
- post-service.test.ts: ip_mismatch ソフトチェックテストを「IP変更時も書き込み成功」テストに書き換え

### テスト結果サマリー

- npx vitest run: 18ファイル 574テスト PASS
- npx cucumber-js: 95シナリオ 454ステップ PASS
