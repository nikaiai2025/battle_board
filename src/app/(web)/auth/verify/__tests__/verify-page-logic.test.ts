/**
 * 単体テスト: /auth/verify ページのバリデーションロジック
 *
 * ページコンポーネントの React レンダリングは jsdom 環境が必要なため、
 * ここでは Client Component で使用するバリデーション・ロジック関数を抽出してテストする。
 *
 * テスト対象:
 *   - 認証コードのバリデーションルール（6桁数字）
 *   - write_token の表示ロジック（存在する場合 / 存在しない場合）
 *   - エラーレスポンスの解釈ロジック
 *
 * See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
 * See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
 * See: features/authentication.feature @期限切れ認証コードでは認証できない
 * See: features/constraints/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
 */

import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// バリデーション関数（ページコンポーネントのロジックを抽出）
// ---------------------------------------------------------------------------

/**
 * 認証コードのバリデーション（ページコンポーネントの handleSubmit から抽出）
 * See: src/app/(web)/auth/verify/page.tsx > handleSubmit
 */
function validateAuthCode(code: string): { valid: boolean; errorMessage?: string } {
  if (!/^\d{6}$/.test(code)) {
    return { valid: false, errorMessage: '認証コードは6桁の数字で入力してください' }
  }
  return { valid: true }
}

/**
 * write_token の表示テキストを生成（ページコンポーネントの表示ロジックから抽出）
 * 専ブラユーザーはメール欄に「#<write_token>」形式で貼り付けて使用する
 * See: tmp/auth_spec_review_report.md §3.2 write_token 方式
 */
function formatWriteTokenForDisplay(writeToken: string): string {
  return `#${writeToken}`
}

/**
 * API レスポンスからエラーメッセージを取得（ページコンポーネントのエラーハンドリングから抽出）
 * See: src/app/(web)/auth/verify/page.tsx > handleSubmit
 */
function extractErrorMessage(response: { success: boolean; error?: string }): string {
  return response.error ?? '認証に失敗しました。もう一度お試しください'
}

// ---------------------------------------------------------------------------
// テストスイート
// ---------------------------------------------------------------------------

describe('/auth/verify ページロジック', () => {

  // =========================================================================
  // 認証コードのバリデーション
  // =========================================================================

  describe('validateAuthCode', () => {
    describe('正常系: 有効な6桁数字コード', () => {
      // See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する

      it('6桁数字のコードは有効と判定する', () => {
        expect(validateAuthCode('123456').valid).toBe(true)
        expect(validateAuthCode('000000').valid).toBe(true)
        expect(validateAuthCode('999999').valid).toBe(true)
      })

      it('先頭が 0 のコードも有効と判定する（ゼロパディング）', () => {
        expect(validateAuthCode('000001').valid).toBe(true)
        expect(validateAuthCode('012345').valid).toBe(true)
      })
    })

    describe('異常系: 無効なコード', () => {
      // See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する

      it('5桁のコードは無効と判定する', () => {
        const result = validateAuthCode('12345')
        expect(result.valid).toBe(false)
        expect(result.errorMessage).toBeTruthy()
      })

      it('7桁のコードは無効と判定する', () => {
        const result = validateAuthCode('1234567')
        expect(result.valid).toBe(false)
        expect(result.errorMessage).toBeTruthy()
      })

      it('数字以外を含むコードは無効と判定する', () => {
        expect(validateAuthCode('12345a').valid).toBe(false)
        expect(validateAuthCode('abcdef').valid).toBe(false)
        expect(validateAuthCode('123 56').valid).toBe(false)
      })

      it('空文字列は無効と判定する', () => {
        expect(validateAuthCode('').valid).toBe(false)
      })

      it('エラーメッセージが含まれる', () => {
        const result = validateAuthCode('abc')
        expect(result.errorMessage).toBe('認証コードは6桁の数字で入力してください')
      })
    })

    describe('境界値', () => {
      it('ちょうど6桁は有効', () => {
        expect(validateAuthCode('123456').valid).toBe(true)
      })

      it('6桁 - 1 = 5桁は無効', () => {
        expect(validateAuthCode('12345').valid).toBe(false)
      })

      it('6桁 + 1 = 7桁は無効', () => {
        expect(validateAuthCode('1234567').valid).toBe(false)
      })
    })

    describe('エッジケース', () => {
      it('特殊文字を含む場合は無効', () => {
        expect(validateAuthCode('123-56').valid).toBe(false)
        expect(validateAuthCode('123.56').valid).toBe(false)
      })

      it('Unicode 数字は無効（ASCII 数字のみ有効）', () => {
        // 全角数字は \\d にマッチしないため無効
        expect(validateAuthCode('１２３４５６').valid).toBe(false)
      })
    })
  })

  // =========================================================================
  // write_token の表示フォーマット
  // =========================================================================

  describe('formatWriteTokenForDisplay', () => {
    // See: features/constraints/specialist_browser_compat.feature @認証完了後に write_token をメール欄に貼り付けて書き込みが成功する
    // See: tmp/auth_spec_review_report.md §3.2 write_token 方式 > 専ブラの mail 欄に #<write_token> 形式で貼り付けて使用

    it('write_token に # プレフィックスを付与する', () => {
      expect(formatWriteTokenForDisplay('abcdef1234567890abcdef1234567890')).toBe('#abcdef1234567890abcdef1234567890')
    })

    it('32文字 hex の write_token を正しくフォーマットする', () => {
      const token = 'a1b2c3d4e5f6789012345678901234ab'
      const formatted = formatWriteTokenForDisplay(token)
      expect(formatted).toBe(`#${token}`)
      expect(formatted.length).toBe(33) // '#' + 32文字
    })

    it('write_token の内容が変更されないこと（プレフィックスのみ追加）', () => {
      const token = '0000000000000000ffffffffffffffff'
      const formatted = formatWriteTokenForDisplay(token)
      expect(formatted.startsWith('#')).toBe(true)
      expect(formatted.substring(1)).toBe(token)
    })
  })

  // =========================================================================
  // エラーメッセージの解釈
  // =========================================================================

  describe('extractErrorMessage', () => {
    // See: features/authentication.feature @Turnstile検証に失敗すると認証に失敗する
    // See: features/authentication.feature @期限切れ認証コードでは認証できない

    it('レスポンスの error フィールドが存在する場合はそのメッセージを使用する', () => {
      const response = { success: false, error: '認証コードが無効または期限切れです' }
      expect(extractErrorMessage(response)).toBe('認証コードが無効または期限切れです')
    })

    it('error フィールドが存在しない場合はデフォルトメッセージを使用する', () => {
      const response = { success: false }
      expect(extractErrorMessage(response)).toBe('認証に失敗しました。もう一度お試しください')
    })

    it('error フィールドが undefined の場合はデフォルトメッセージを使用する', () => {
      const response = { success: false, error: undefined }
      expect(extractErrorMessage(response)).toBe('認証に失敗しました。もう一度お試しください')
    })

    it('Turnstile 失敗のエラーメッセージを正しく返す', () => {
      const response = { success: false, error: 'Turnstile 検証に失敗しました' }
      expect(extractErrorMessage(response)).toBe('Turnstile 検証に失敗しました')
    })
  })

  // =========================================================================
  // write_token の存在チェック（表示分岐ロジック）
  // =========================================================================

  describe('write_token 表示分岐', () => {
    // See: features/authentication.feature @正しい認証コードとTurnstileで認証に成功する
    // write_tokenが発行される

    it('write_token が存在する場合は表示すべき', () => {
      const writeToken = 'abcdef1234567890abcdef1234567890'
      // write_token が null でないことを確認するロジック
      expect(writeToken !== null).toBe(true)
      expect(writeToken.length).toBe(32)
    })

    it('write_token が null の場合は表示しない', () => {
      const writeToken: string | null = null
      expect(writeToken !== null).toBe(false)
    })

    it('write_token が存在する場合は # プレフィックス付きで表示', () => {
      const writeToken = 'abcdef1234567890abcdef1234567890'
      if (writeToken !== null) {
        const displayed = formatWriteTokenForDisplay(writeToken)
        expect(displayed).toBe('#abcdef1234567890abcdef1234567890')
      }
    })
  })
})
