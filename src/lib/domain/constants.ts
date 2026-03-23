/**
 * デフォルト板ID。
 *
 * 板IDが未指定・不正のとき、およびシステム内で暗黙的に使用する板の識別子。
 * URLパス /{boardId}/ に対応する。将来的に複数板をサポートする場合も
 * 「デフォルト板」の概念は維持される。
 *
 * 制約: /^[a-z0-9_]+$/ （validation.ts BOARD_ID_PATTERN）
 */
export const DEFAULT_BOARD_ID = "livebot";
