import type { WorkspaceError } from "../../lib/bindings";

export function workspaceErrorText(error: WorkspaceError): string {
  switch (error.kind) {
    case "noFolder":
      return "No folder is currently open.";
    case "outsideFolder":
      return "The requested path is outside the opened folder.";
    case "notFound":
      return "The requested file or folder was not found.";
    case "notText":
      return "The file is binary or does not contain valid text.";
    case "tooLarge":
      return `The file is too large (${error.bytes} bytes, maximum 2 MB).`;
    case "changedOnDisk":
      return "This file changed on disk.";
    case "io":
      return error.message;
    case "storage":
      return error.message;
  }
}
