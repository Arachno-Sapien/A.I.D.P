import { describe, expect, it } from "vitest";
import { errorText } from "./errorText";

describe("errorText", () => {
  it("formats invalidKey", () => {
    expect(errorText({ kind: "invalidKey" })).toBe(
      "The provider rejected the API key. Check the key and try again.",
    );
  });

  it("formats rateLimited with seconds", () => {
    expect(
      errorText({ kind: "rateLimited", retryAfterSecs: 7 }),
    ).toBe("The provider is rate limiting you. Try again in 7 seconds.");
  });

  it("formats rateLimited with null/undefined seconds", () => {
    expect(
      errorText({ kind: "rateLimited", retryAfterSecs: null }),
    ).toBe("The provider is rate limiting you. Try again in a moment.");
  });

  it("formats modelNotFound", () => {
    expect(errorText({ kind: "modelNotFound" })).toBe(
      "The provider doesn't know this model. Pick another model.",
    );
  });

  it("formats contextTooLong", () => {
    expect(errorText({ kind: "contextTooLong" })).toBe(
      "This conversation is too long for the model. Start a new chat.",
    );
  });

  it("formats offline", () => {
    expect(errorText({ kind: "offline" })).toBe(
      "Can't reach the provider. Check your internet connection, or start Ollama on the Models page.",
    );
  });

  it("formats provider error with message", () => {
    expect(
      errorText({ kind: "provider", message: "HTTP 500: boom" }),
    ).toBe("The provider returned an error: HTTP 500: boom");
  });

  it("formats cancelled", () => {
    expect(errorText({ kind: "cancelled" })).toBe("Stopped.");
  });
});
