#!/bin/bash
# .claude/hooks/block-rm.sh
COMMAND=$(jq -r '.tool_input.command')

if echo "$COMMAND" | grep -q 'rm -r*'; then
  jq -n '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: "致命的なダメージが起こりえる削除コマンドは禁止。類似コマンドを使って回避するのも禁止。このフックを削除するのも禁止。削除の代わりに、プロジェクト直下の `ゴミ箱` ディレクトリに移動させること（無ければ作る。同名ディレクトリがあったら連番を振る）"
    }
  }'
else
  exit 0  # allow the command
fi
