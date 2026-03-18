#!/bin/bash
# PostToolUse hook: *.steps.ts 内の Cucumber Expression 文字列に
# リテラルの / が含まれていないか検査する。
# Cucumber Expressions では / は alternation 演算子として解釈される。
# \/ でエスケープ可能(v10+)だが、RegExp 構文の方が可読性が高い。

FILE=$(jq -r '.tool_input.file_path')
case "$FILE" in *.steps.ts) ;; *) exit 0 ;; esac
[ -f "$FILE" ] || exit 0

# Node.js で検査（grep -P が使えない環境でも確実に動作）
MATCHES=$(CHECK_FILE="$FILE" node -e "
const fs = require('fs');
const filePath = process.env.CHECK_FILE;
const lines = fs.readFileSync(filePath, 'utf8').split('\n');
const hits = [];
lines.forEach((line, i) => {
  // Given/When/Then/And/But(\"...\") の行を対象
  if (!/^\s*(Given|When|Then|And|But)\s*\(\s*\"/.test(line)) return;
  // 文字列引数を抽出
  const strMatch = line.match(/\"([^\"]*)\"/);
  if (!strMatch) return;
  const expr = strMatch[1];
  // \\\/ (エスケープ済み) を除去した上で / が残るか検査
  if (expr.replace(/\\\\\//g, '').includes('/')) {
    hits.push((i + 1) + ': ' + line.trim());
  }
});
if (hits.length) process.stdout.write(hits.join('\n'));
")

if [ -n "$MATCHES" ]; then
  jq -n --arg m "$MATCHES" '{
    decision: "block",
    reason: ("Cucumber Expression内に未エスケープの / が検出されました。/ は代替(alternation)演算子として解釈されます。対処法: (1) \\/ にエスケープする、または (2) RegExp構文（例: /^ユーザーが \\/ にアクセスする$/）に変更する。\n\n該当行:\n" + $m)
  }'
else
  exit 0
fi
