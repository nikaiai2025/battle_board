# Sprint-22 計画書

> 作成: 2026-03-15
> ステータス: in_progress

## スプリント目標

Web UIのマイページ導線を開通させる。Header認証状態の動的判定、Mypage API群のis_verifiedチェック追加。

## 背景

マイページ（/mypage）はUI・APIともに実装済みだが、以下の2点が未接続のため画面から到達・利用できない:
1. layout.tsx が `isAuthenticated={false}` 固定 → マイページリンクが表示されない
2. /api/mypage系APIが is_verified を確認していない → 未認証ユーザーがアクセスできてしまう

## スコープ

### TASK-061: Header認証状態判定 + マイページ導線開通
- **担当:** bdd-coding
- **優先度:** 高
- **内容:**
  - `src/app/(web)/layout.tsx` でedge-token Cookieを読み取り、認証状態を判定
  - 判定方式: edge-token Cookie存在チェック（API境界で実際の認証チェックが行われるため、layout層はCookie存在で十分）
  - `isAuthenticated` をHeaderに動的に渡す
- **locked_files:**
  - `src/app/(web)/layout.tsx`
- **見積:** 小

### TASK-062: Mypage API認証整合（is_verifiedチェック追加）
- **担当:** bdd-coding
- **優先度:** 高
- **内容:**
  - `/api/mypage`（GET）: findByAuthToken後にis_verifiedチェック追加
  - `/api/mypage/history`（GET）: 同上
  - `/api/mypage/username`（PUT）: 同上
  - `/api/mypage/upgrade`（POST）: 同上
  - is_verified=falseの場合は401を返す
- **locked_files:**
  - `src/app/api/mypage/route.ts`
  - `src/app/api/mypage/history/route.ts`
  - `src/app/api/mypage/username/route.ts`
  - `src/app/api/mypage/upgrade/route.ts`
- **depends_on:** なし（TASK-061と並行可能）
- **見積:** 小

## 実行順序

```
TASK-061（Header認証）─────→ 並行
TASK-062（Mypage API整合）─→ 並行
```

locked_files競合なし → 並行起動。

## 結果

| TASK | ステータス | 備考 |
|------|----------|------|
| TASK-061 | completed | layout.tsx: edge-token Cookie存在チェック→isAuthenticated動的設定 |
| TASK-062 | completed | mypage API 4エンドポイント: is_verifiedチェック追加 |

## 最終テスト結果

- vitest: 18ファイル / 601テスト / 全PASS
- cucumber-js: 106シナリオ (103 passed, 3 pending) / 0 failed
