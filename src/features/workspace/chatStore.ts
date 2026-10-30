import { createChatStore } from "../chat/store";
import { agentHooks } from "./agent";

export const useWorkspaceChatStore = createChatStore("workspace", agentHooks);
