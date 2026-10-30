import type { ChatHooks, ToolStep } from "../chat/store";
import { useWorkspaceStore } from "./store";

export const agentHooks: ChatHooks = {
  onToolCall: (step: ToolStep) => {
    if (!step.needsAnswer) return;

    if (step.action.tool === "editFile") {
      useWorkspaceStore
        .getState()
        .showToolProposal(
          step.id,
          step.action.path,
          step.action.before,
          step.action.after,
        );
    } else if (step.action.tool === "createFile") {
      useWorkspaceStore
        .getState()
        .showToolProposal(step.id, step.action.path, "", step.action.text);
    }
  },

  onToolResult: (step: ToolStep) => {
    const store = useWorkspaceStore.getState();
    if (store.proposal?.toolId === step.id) {
      useWorkspaceStore.setState({ proposal: null, needsGitConfirm: false });
    }

    if (step.outcome?.status === "ok") {
      if (
        step.action.tool === "editFile" ||
        step.action.tool === "createFile"
      ) {
        void store.reloadIfClean(step.action.path);
        void store.refreshTree();
      }
    }
  },
};
