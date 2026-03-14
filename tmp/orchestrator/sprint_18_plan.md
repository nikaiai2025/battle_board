# Sprint-18 計画書: 専ブラ向けレスポンス改善（絶対URL + Shift-JIS文字化け修正）

> 作成: 2026-03-15
> ステータス: **completed**

## 背景

Sprint-17完了後の実機テスト（Siki）で2つの問題が確認された:
1. `buildAuthRequired` の認証URLが相対パス（`/auth/verify?...`）のため、専ブラがリンクとして認識できない
2. 専ブラ向けレスポンスのShift-JIS（CP932）エンコードで一部文字が `???` に化ける

いずれもBDDシナリオ変更を伴わない内部実装修正。

## タスク一覧

### Wave 1（並行可）

| TASK_ID | 概要 | 担当 | locked_files |
|---|---|---|---|
| TASK-046 | buildAuthRequired 絶対URL化 | bdd-coding | `src/lib/infrastructure/adapters/bbs-cgi-response.ts`, `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts`, `src/app/(senbra)/test/bbs.cgi/route.ts` |
| TASK-047 | Shift-JIS文字化け調査・修正 | bdd-coding | `src/lib/infrastructure/encoding/shift-jis.ts`, `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts`, `src/lib/infrastructure/adapters/dat-formatter.ts` |

## 依存関係

```
TASK-046 (並行) + TASK-047 (並行)
```

locked_filesに重複がないため並行実行可能。

## 完了基準

- [ ] `npx vitest run` 全PASS
- [ ] `npx cucumber-js` 全PASS
- [ ] 認証URLが絶対URL形式で出力される
- [ ] Shift-JIS変換で ??? が発生しない

## 結果

### テスト結果
- vitest: 18ファイル / 574テスト 全PASS（Sprint-17: 552 → +22テスト）
- cucumber-js: 95シナリオ / 454ステップ 全PASS

### タスク完了状況
| TASK_ID | ステータス | 備考 |
|---|---|---|
| TASK-046 | completed | buildAuthRequired 絶対URL化 |
| TASK-047 | completed | Shift-JIS文字化け修正（sanitizeForCp932追加） |
| TASK-048 | completed | sanitizeForCp932ラウンドトリップ方式に修正（TASK-047の偽陽性バグ修正） |
| TASK-049 | completed | verifyEdgeToken IPチェック廃止 + resolveAuth簡素化 |
| TASK-050 | completed | ShiftJisEncoder.decode()をTextDecoder('shift_jis')に置き換え |
| TASK-051 | completed | bbs.cgi Shift-JISデコード順序修正（URLデコード→SJISデコードに是正） |

### 最終テスト結果
- vitest: 18ファイル / 587テスト 全PASS（Sprint-17: 552 → +35テスト）
- cucumber-js: 95シナリオ / 454ステップ 全PASS

### 変更ファイル一覧
**変更:**
- `src/lib/infrastructure/adapters/bbs-cgi-response.ts` — buildAuthRequired に baseUrl 引数追加
- `src/lib/infrastructure/adapters/__tests__/bbs-cgi-response.test.ts` — 絶対URLテスト追加
- `src/app/(senbra)/test/bbs.cgi/route.ts` — getBaseUrl() 追加、buildAuthRequired呼び出し修正、decodeFormData使用
- `features/step_definitions/specialist_browser_compat.steps.ts` — TEST_BASE_URL追加
- `src/lib/infrastructure/encoding/shift-jis.ts` — sanitizeForCp932() 追加、decode()をTextDecoder化、decodeFormData()追加
- `src/lib/infrastructure/encoding/__tests__/shift-jis.test.ts` — CP932変換網羅テスト+decodeFormData 10件追加
- `src/lib/services/auth-service.ts` — verifyEdgeTokenからIPチェック削除、VerifyResult型からip_mismatch削除
- `src/lib/services/post-service.ts` — resolveAuthのip_mismatch分岐削除
- `src/lib/services/__tests__/auth-service.test.ts` — IP変更テスト書き換え
- `src/lib/services/__tests__/post-service.test.ts` — ip_mismatchテスト書き換え
- `src/app/(senbra)/__tests__/route-handlers.test.ts` — makeShiftJisBody修正
