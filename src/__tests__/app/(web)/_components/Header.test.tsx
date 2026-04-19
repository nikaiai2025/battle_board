/* @vitest-environment jsdom */

/**
 * 単体テスト: Web Header の channel-aware 表示制御
 *
 * See: features/user_registration.feature @専ブラ認証リンクから通常ブラウザで認証した後に同一ユーザーで本登録導線へ進める
 * See: docs/architecture/components/web-ui.md > Header / Layout は channel-aware にする
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Header from "../../../../app/(web)/_components/Header";

describe("Header", () => {
	it("web channel の認証済みユーザーにはマイページ導線を表示する", () => {
		render(
			<Header isAuthenticated={true} isRegistered={true} channel="web" />,
		);

		expect(screen.getByText("マイページ")).toBeTruthy();
	});

	it("senbra channel の認証済みユーザーにはマイページ導線を表示しない", () => {
		render(
			<Header isAuthenticated={true} isRegistered={true} channel="senbra" />,
		);

		expect(screen.queryByText("マイページ")).toBeNull();
	});
});
