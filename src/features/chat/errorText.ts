import type { ProviderError } from "../../lib/bindings";

export function errorText(e: ProviderError): string {
  switch (e.kind) {
    case "invalidKey":
      return "The provider rejected the API key. Check the key and try again.";
    case "rateLimited":
      return e.retryAfterSecs != null
        ? `The provider is rate limiting you. Try again in ${e.retryAfterSecs} seconds.`
        : "The provider is rate limiting you. Try again in a moment.";
    case "modelNotFound":
      return "The provider doesn't know this model. Pick another model.";
    case "contextTooLong":
      return "This conversation is too long for the model. Start a new chat.";
    case "offline":
      return "Can't reach the provider. Check your internet connection, or start Ollama on the Models page.";
    case "provider":
      return `The provider returned an error: ${e.message}`;
    case "cancelled":
      return "Stopped.";
  }
}
