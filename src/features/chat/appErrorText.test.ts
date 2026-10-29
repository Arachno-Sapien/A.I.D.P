import { describe, expect, it } from "vitest";
import type { AppError, ProviderError } from "../../lib/bindings";
import { appErrorText } from "./appErrorText";

describe("appErrorText", () => {
  it("formats provider error by delegating to errorText", () => {
    expect(
      appErrorText({
        kind: "provider",
        error: { kind: "invalidKey" },
      }),
    ).toBe("The provider rejected the API key. Check the key and try again.");
  });

  it("formats notFound", () => {
    expect(appErrorText({ kind: "notFound" })).toBe(
      "That connection no longer exists. Pick another model.",
    );
  });

  it("formats keyMissing", () => {
    expect(appErrorText({ kind: "keyMissing" })).toBe(
      "The key for this connection is missing from the system keychain. Replace it on the Models page.",
    );
  });

  it("formats invalidInput with message", () => {
    expect(
      appErrorText({ kind: "invalidInput", message: "label cannot be blank" }),
    ).toBe("label cannot be blank");
  });

  it("formats insecureUrl", () => {
    expect(
      appErrorText({
        kind: "insecureUrl",
        url: "http://api.example.com",
      }),
    ).toBe(
      "The URL must use https. Plain http is allowed only for localhost or your own network.",
    );
  });

  it("formats keychain with message", () => {
    expect(
      appErrorText({ kind: "keychain", message: "keychain locked" }),
    ).toBe(
      "Couldn't use the system keychain: keychain locked. On Linux this needs GNOME Keyring or KWallet.",
    );
  });

  it("formats storage with message", () => {
    expect(
      appErrorText({ kind: "storage", message: "disk full" }),
    ).toBe("Couldn't read or write the local database: disk full");
  });

  it("every error kind has text", () => {
    const providerErrors: ProviderError[] = [
      { kind: "invalidKey" },
      { kind: "rateLimited", retryAfterSecs: null },
      { kind: "rateLimited", retryAfterSecs: 5 },
      { kind: "modelNotFound" },
      { kind: "contextTooLong" },
      { kind: "offline" },
      { kind: "provider", message: "msg" },
      { kind: "cancelled" },
    ];

    const appErrors: AppError[] = [
      ...providerErrors.map(
        (error) => ({ kind: "provider", error }) as AppError,
      ),
      { kind: "notFound" },
      { kind: "keyMissing" },
      { kind: "invalidInput", message: "msg" },
      { kind: "insecureUrl", url: "url" },
      { kind: "keychain", message: "msg" },
      { kind: "storage", message: "msg" },
    ];

    for (const err of appErrors) {
      const text = appErrorText(err);
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
