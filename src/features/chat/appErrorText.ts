import type { AppError } from "../../lib/bindings";
import { errorText } from "./errorText";

export function appErrorText(e: AppError): string {
  switch (e.kind) {
    case "provider":
      return errorText(e.error);
    case "notFound":
      return "That connection no longer exists. Pick another model.";
    case "keyMissing":
      return "The key for this connection is missing from the system keychain. Replace it on the Models page.";
    case "invalidInput":
      return e.message;
    case "insecureUrl":
      return "The URL must use https. Plain http is allowed only for localhost or your own network.";
    case "keychain":
      return `Couldn't use the system keychain: ${e.message}. On Linux this needs GNOME Keyring or KWallet.`;
    case "storage":
      return `Couldn't read or write the local database: ${e.message}`;
    case "ollama":
      return e.message;
    case "update":
      return e.message;
  }
}
