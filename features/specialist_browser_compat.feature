# features/specialist_browser_compat.feature
# ステータス: 承認済み v4
#
# NOTE: このファイルはユーザーストーリーではなく「プロトコル準拠の制約条件」を
# Gherkin形式で記述したもの。5ch専用ブラウザ（ChMate, Siki等）との互換性を
# 保証するためのインテグレーションレベルの受け入れ基準。
#
# 参照: docs/research/research_merged.md

Feature: 5ch専用ブラウザ互換性
  # US-013: 5ch専用ブラウザからの閲覧・書き込み
  # CON-001: 5ch専ブラプロトコル互換

  5ch専ブラユーザーとして、使い慣れた専用ブラウザ（ChMate、Siki等）から
  BattleBoardのスレッド閲覧・書き込みをしたい。匿名掲示板文化に慣れた
  ユーザーにとって専ブラの操作感は重要であり、DAT形式・subject.txt・bbs.cgi等の
  5chプロトコルに厳密に準拠する必要がある。

  # ===========================================
  # エンコーディング
  # ===========================================

  Scenario: すべてのレスポンスがShift_JIS（CP932）でエンコードされる
    When 専ブラが任意のエンドポイントにリクエストする
    Then レスポンスはShift_JIS（CP932）でエンコードされている
    And Content-Typeヘッダに "charset=Shift_JIS" が含まれる

  Scenario: 専ブラからのPOSTデータがShift_JISとして正しくデコードされる
    When 専ブラがShift_JISエンコードされた書き込みデータをPOSTする
    Then サーバーはShift_JISとしてデコードし内部UTF-8に変換する
    And 書き込み内容が文字化けなく保存される

  Scenario: Shift_JIS範囲外の文字がHTML数値参照として保持される
    # CP932に含まれない文字（絵文字等）はShift_JISエンコード時に情報が消失する。
    # eddist参考実装（encoding_rs）に倣い、HTML数値参照に変換することで
    # 専ブラがHTMLとして解釈し元の文字を表示できるようにする。
    # NOTE: SETTING.TXTの BBS_UNICODE=pass との整合性を確認すること。
    #   現状「Unicodeを通す」と宣言しているが、実装はCP932非対応文字を全角？に置換している。
    Given 本文に絵文字 "😅" を含む書き込みが存在する
    When 専ブラが当該DATファイルを取得する
    Then 本文フィールドに "&#128517;" が含まれる
    And 全角？への置換は行われない

  Scenario: 異体字セレクタがDAT出力時に除去される
    # U+FE0F（絵文字スタイル指示）やU+FE0E（テキストスタイル指示）は
    # 表示ヒントであり、Shift_JIS/DATの文脈では不要。
    # HTML数値参照に変換すると専ブラで文字化けマークとして表示されるため、除去する。
    # See: eddistで "🕳️"(U+1F573 U+FE0F) 表示時に文字化けが発生する既知問題
    Given 本文に異体字セレクタ付き絵文字 "🕳️" を含む書き込みが存在する
    When 専ブラが当該DATファイルを取得する
    Then 本文フィールドに異体字セレクタ(U+FE0F, U+FE0E)が含まれない
    And 基底文字のHTML数値参照 "&#128371;" は保持される

  Scenario: ゼロ幅接合子(ZWJ)がHTML数値参照として保持される
    # ZWJ(U+200D)は結合絵文字（👨‍👩‍👧等）の構成要素であり、
    # 除去すると絵文字が分解されてしまう。HTML数値参照として保持する。
    Given 本文に結合絵文字 "👨‍👩‍👧" を含む書き込みが存在する
    When 専ブラが当該DATファイルを取得する
    Then 本文フィールドにZWJのHTML数値参照 "&#8205;" が含まれる
    And 各構成文字のHTML数値参照も保持される

  # ===========================================
  # スレッド一覧 (subject.txt)
  # ===========================================

  Scenario: subject.txtが所定のフォーマットで返される
    Given スレッドキー "1234567890" のスレッド "テストスレ" が存在し 5件のレスがある
    When 専ブラが /{板ID}/subject.txt にGETリクエストする
    Then "1234567890.dat<>テストスレ (5)" を含むテキストが返される
    And 1行1スレッドの形式である
    And レス数が実際の件数と一致する

  Scenario: 複数スレッドがbump順（最終書き込み順）で並ぶ
    Given スレッド "古いスレ" とスレッド "新しいスレ" が存在する
    And "新しいスレ" の最終書き込みが "古いスレ" より新しい
    When 専ブラが subject.txt を取得する
    Then "新しいスレ" の行が "古いスレ" の行より先に出現する

  # ===========================================
  # スレッドデータ (.datファイル)
  # ===========================================

  Scenario: DATファイルが所定のフォーマットで返される
    Given スレッドキー "1234567890" のスレッドに1件以上のレスがある
    When 専ブラが /{板ID}/dat/1234567890.dat にGETリクエストする
    Then 各行が "名前<>メール<>日付とID<>本文<>スレッドタイトル" 形式である

  Scenario: DATファイルの1行目のみスレッドタイトルを含む
    Given スレッド "テストスレ" に3件のレスがある
    When 専ブラが当該DATファイルを取得する
    Then 1行目の末尾フィールドに "テストスレ" が含まれる
    And 2行目以降の末尾フィールドは空である

  Scenario: レス内の改行がHTMLのbrタグに変換される
    Given 改行を含む本文 "1行目\n2行目" の書き込みが存在する
    When 専ブラが当該DATファイルを取得する
    Then 本文フィールドに "1行目<br>2行目" が含まれる
    And DATファイル上では1レスが1物理行に収まっている

  Scenario: レス内のHTML特殊文字がエスケープされる
    Given 本文に "<script>" を含む書き込みが存在する
    When 専ブラが当該DATファイルを取得する
    Then 本文フィールドに "&lt;script&gt;" が含まれる

  Scenario: 日次リセットIDがDATの日付フィールドに正しく含まれる
    Given ユーザーの日次リセットID が "AbCd1234" である
    When 当該ユーザーの書き込みを含むDATファイルを取得する
    Then 日付フィールドに "ID:AbCd1234" が含まれる
    And 日付フォーマットは "YYYY/MM/DD(曜日) HH:MM:SS.ff ID:xxxxxxxx" 形式である

  # ===========================================
  # 専ブラ認証フロー（G4対応）
  # ===========================================
  # 専ブラはTurnstileウィジェットを表示できないため、Webブラウザで認証を完了し
  # write_tokenをメール欄に貼り付ける方式で認証を橋渡しする。
  # Cookie共有可能な専ブラではメール欄トークン不要。

  Scenario: 専ブラからの初回書き込みで認証案内が返される
    Given ユーザーが専ブラで未認証である
    When bbs.cgiに書き込みをPOSTする
    Then レスポンスに認証コードと認証ページURLが含まれる
    And edge-token Cookieが発行される

  Scenario: 認証完了後にwrite_tokenをメール欄に貼り付けて書き込みが成功する
    Given ユーザーが認証ページで認証を完了しwrite_tokenを取得している
    When bbs.cgiのメール欄に "#<write_token>" を含めてPOSTする
    Then write_tokenが検証される
    And edge-token Cookieが有効化される
    And 書き込みがスレッドに追加される
    And レスポンスのtitleタグに "書きこみました" が含まれる
    And メール欄のwrite_tokenは書き込みデータに含まれない

  Scenario: Cookie共有の専ブラでは認証後そのまま書き込みできる
    Given ユーザーがWebブラウザで認証を完了している
    And 専ブラがWebブラウザとCookieを共有している
    When bbs.cgiに書き込みをPOSTする
    Then 書き込みがスレッドに追加される

  Scenario: 専ブラがbbs.cgi応答のedge-token Cookieを保存し次回リクエストで送信する
    # 根拠: ChMate等の専ブラはSet-CookieヘッダにSecureやSameSite属性が付与されていると
    #       Cookieを保存しない。eddist参考実装に倣い、これらの属性を設定しないことで互換性を担保する。
    # See: tmp/test_report_sprint20.md（Sprint-20検証で発見・実証）
    # See: github.com/edginer/eddist > eddist-server/src/shiftjis.rs > add_set_cookie
    Given ユーザーがwrite_tokenで書き込みに成功しedge-token Cookieが発行されている
    When 専ブラがwrite_tokenなしでbbs.cgiに再度POSTする
    Then リクエストのCookieヘッダにedge-tokenが含まれる
    And 再認証は要求されない
    And 書き込みがスレッドに追加される

  Scenario: edge-token CookieのSet-Cookieヘッダに専ブラ非互換属性を含まない
    # Secure属性やSameSite属性は一般的なWebセキュリティのベストプラクティスだが、
    # 専ブラのHTTPクライアント実装と互換性がない。
    When bbs.cgiがedge-token Cookieを設定するレスポンスを返す
    Then Set-CookieヘッダにSecure属性が含まれない
    And Set-CookieヘッダにSameSite属性が含まれない
    And Set-CookieヘッダにHttpOnly属性が含まれる
    And Set-CookieヘッダにPath=/が含まれる

  Scenario: 無効なwrite_tokenでは書き込みが拒否される
    Given ユーザーが専ブラで未認証である
    When bbs.cgiのメール欄に無効なwrite_tokenを含めてPOSTする
    Then レスポンスのtitleタグに "ＥＲＲＯＲ" が含まれる

  # ===========================================
  # 書き込みAPI (bbs.cgi)
  # ===========================================

  Scenario: 専ブラからの書き込みが正常に処理される
    Given ユーザーが専ブラで認証済みである
    When bbs.cgiに所定のPOSTパラメータ（bbs, key, FROM, mail, MESSAGE, submit）を送信する
    Then 書き込みがスレッドに追加される
    And レスポンスのtitleタグに "書きこみました" が含まれる

  Scenario: 専ブラからの新規スレッド作成が正常に処理される
    Given ユーザーが専ブラで認証済みである
    When bbs.cgiにsubjectパラメータ付きでPOSTする
    Then 新しいスレッドが作成される
    And subject.txtに新スレッドが追加される

  Scenario: 書き込みエラー時に専ブラが認識できるエラーレスポンスが返される
    Given ユーザーが専ブラで認証済みである
    When 本文が空の状態でbbs.cgiにPOSTする
    Then レスポンスのtitleタグに "ＥＲＲＯＲ" が含まれる
    And エラー理由がbodyに含まれる

  Scenario: 専ブラのコマンド文字列がゲームコマンドとして解釈される
    Given ユーザーが専ブラで認証済みである
    When MESSAGE に "!tell >>5" を含めてbbs.cgiにPOSTする
    Then 書き込みが追加される
    And コマンド "!tell" が対象 ">>5" に対して実行される
    # コマンド実行結果はシステムメッセージとして後続レスに表示される

  # ===========================================
  # 差分同期（パフォーマンス）
  # ===========================================

  Scenario: Rangeヘッダ付きリクエストに差分データのみ返す
    Given スレッドのDATファイルが15024バイトである
    When 専ブラが "Range: bytes=15024-" ヘッダ付きでDATファイルをリクエストする
    And 新しいレスが追加されている
    Then ステータスコード 206 Partial Content が返される
    And 15024バイト目以降の差分データのみがレスポンスされる

  Scenario: 更新がない場合は304を返す
    Given スレッドのDATファイルに前回リクエスト以降の更新がない
    When 専ブラが If-Modified-Since ヘッダ付きでリクエストする
    Then ステータスコード 304 Not Modified が返される
    And レスポンスボディは空である

  # ===========================================
  # 板設定 (SETTING.TXT)
  # ===========================================

  Scenario: SETTING.TXTが板の設定情報を返す
    When 専ブラが /{板ID}/SETTING.TXT にGETリクエストする
    Then "BBS_TITLE=" を含むテキストが返される
    And "BBS_NONAME_NAME=名無しさん" が含まれる

  # ===========================================
  # 板一覧メニュー (bbsmenu.html / bbsmenu.json)
  # ===========================================

  Scenario: bbsmenu.htmlが板一覧を返す
    When 専ブラが /bbsmenu.html にGETリクエストする
    Then 板へのリンクを含むHTMLが返される
    And リンク先が板のルートURLを指している

  Scenario: bbsmenu.jsonがJSON形式で板一覧を返す
    When 専ブラが /bbsmenu.json にGETリクエストする
    Then JSON形式のレスポンスが返される
    And menu_list配列に板情報が含まれる
    And 各板にurl, board_name, directory_nameが含まれる
    And Content-Typeが "application/json" である

  # ===========================================
  # URL体系互換（5ch URLスキーム）
  # ===========================================
  # 専ブラはbbs.cgiのパスや板URLから5chのURL体系に基づいてスレッド閲覧URL・
  # 過去ログURL等を自動構築する。これらのURLにルートが存在しないと、
  # スレッドリンクのコピーやブラウザでの閲覧、過去ログ取得が機能しない。
  #
  # 5chのURL体系:
  #   板トップ:        /{板ID}/
  #   スレッド閲覧:    /test/read.cgi/{板ID}/{スレッドキー}/
  #   DAT取得:         /{板ID}/dat/{スレッドキー}.dat
  #   過去ログDAT:     /{板ID}/kako/{下位ディレクトリ}/{スレッドキー}.dat

  Scenario: read.cgiのURLでスレッドが閲覧できる
    # 専ブラがスレッドURLとして構築する /test/read.cgi/{板ID}/{スレッドキー}/ に
    # ルートが存在し、スレッド内容を返す必要がある。
    # このURLは専ブラのスレッドリンクコピーや通常ブラウザでの閲覧に使用される。
    # リダイレクト先: /{板ID}/{スレッドキー}/ 形式のWeb UIスレッド表示ページ
    Given スレッドキー "1234567890" のスレッドが存在する
    When /test/read.cgi/battleboard/1234567890/ にGETリクエストする
    Then /battleboard/1234567890/ にリダイレクトされる

  Scenario: 板トップURLがアクセス可能である
    # bbsmenu.html/jsonで板URLとして /{板ID}/ を返しているため、
    # 通常ブラウザでリンクを開いた場合に404にならないようにする。
    # /{板ID}/ が直接スレッド一覧ページとして機能する。
    When /battleboard/ にGETリクエストする
    Then スレッド一覧が表示される

  Scenario: 過去ログ(kako)リクエストに適切に応答する
    # 専ブラはDAT取得失敗時に /kako/ パスへフォールバックすることがある。
    # 過去ログ機能が未実装でもエラーではなく空応答を返し、
    # 専ブラの不要なリトライを防ぐ。
    When 専ブラが /{板ID}/kako/ 配下のDATファイルをリクエストする
    Then ステータスコード 404 が返される
    And 専ブラが解釈可能な形式で応答する

  # ===========================================
  # インフラ制約（HTTP:80 / ホスティング）
  # ===========================================
  # ChMateの5chプロトコルHTTPクライアントはHTTP（ポート80）で接続する。
  # bbsmenu取得はWebView（HTTPS:443）だが、subject.txt・DAT・bbs.cgiは
  # Raw HTTPクライアント（HTTP:80）を使用する。
  #
  # この制約により:
  #   - VercelはHTTP:80を308でHTTPSにリダイレクトし、ChMateが追従できないため使用不可
  #   - Cloudflare Workers/Pagesへ移行済み（「Always Use HTTPS」= OFF）
  #   - ホスティング選定時にHTTP:80直接応答の可否が必須要件となる
  #
  # See: docs/research/chmate_debug_report_2026-03-14.md（パケットキャプチャによる確定診断）

  Scenario: 専ブラの5chプロトコル通信がHTTP:80で直接応答される
    # ChMateはsubject.txt・DAT・bbs.cgiをHTTP:80で要求する。
    # 308/301等のHTTPSリダイレクトではChMateが接続に失敗するため、
    # ホスティング環境はHTTP:80のリクエストに対して直接応答できなければならない。
    When 専ブラがHTTP:80で subject.txt にGETリクエストする
    Then HTTPSリダイレクトなしで直接レスポンスが返される

  Scenario: bbs.cgiへのHTTP:80 POSTが直接処理される
    # HTTP→HTTPSリダイレクト（308/307/302）が発生すると、
    # ChMateはリダイレクトに追従できないかPOSTペイロードが消失する。
    When 専ブラがHTTP:80でbbs.cgiにPOSTする
    Then HTTPSリダイレクトなしでPOSTが直接処理される
    And POSTペイロードが保持される

  Scenario: 専ブラ特有のUser-AgentがWAFにブロックされない
    When "Monazilla/1.00" をUser-Agentに含むリクエストが送信される
    Then リクエストは正常に処理される
    And WAFやCDNによるブロックが発生しない
