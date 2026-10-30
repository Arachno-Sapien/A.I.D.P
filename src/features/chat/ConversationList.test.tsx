// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ConversationList } from "./ConversationList";
import { commands } from "../../lib/bindings";
import { useChatStore } from "./store";

vi.mock("../../lib/bindings", () => ({
  commands: {
    listConversations: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    createConversation: vi.fn(),
    deleteConversation: vi.fn().mockResolvedValue({ status: "ok", data: null }),
    loadMessages: vi.fn().mockResolvedValue({ status: "ok", data: [] }),
    appendMessage: vi.fn().mockResolvedValue({ status: "ok", data: 1 }),
  },
}));

afterEach(() => {
  cleanup();
});

describe("ConversationList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.setState({
      conversationId: 1,
      conversations: [
        { id: 1, title: "Rust questions", updatedAt: 100 },
        { id: 2, title: "React notes", updatedAt: 90 },
      ],
      messages: [],
      streaming: false,
    });
  });

  it("filters, creates and deletes chats", async () => {
    render(<ConversationList />);

    // 1. Initial render shows both chats
    expect(screen.getByText("Rust questions")).toBeDefined();
    expect(screen.getByText("React notes")).toBeDefined();

    // 2. Filter chats
    const filterInput = screen.getByPlaceholderText(/filter/i);
    fireEvent.change(filterInput, { target: { value: "react" } });

    expect(screen.queryByText("Rust questions")).toBeNull();
    expect(screen.getByText("React notes")).toBeDefined();

    // Clear filter
    fireEvent.change(filterInput, { target: { value: "" } });
    expect(screen.getByText("Rust questions")).toBeDefined();

    // 3. New chat button calls startNew
    const newChatBtn = screen.getByRole("button", { name: /new chat/i });
    fireEvent.click(newChatBtn);
    expect(useChatStore.getState().conversationId).toBeNull();

    // 4. Delete chat flow: asks inline confirmation
    const deleteBtn = screen.getByLabelText("Delete React notes");
    fireEvent.click(deleteBtn);

    expect(screen.getByText(/delete this chat\?/i)).toBeDefined();

    // Cancel deletion
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(screen.queryByText(/delete this chat\?/i)).toBeNull();
    expect(commands.deleteConversation).not.toHaveBeenCalled();

    // Confirm deletion
    const deleteBtnAgain = screen.getByLabelText("Delete React notes");
    fireEvent.click(deleteBtnAgain);
    const confirmBtn = screen.getByRole("button", { name: /^delete$/i });
    fireEvent.click(confirmBtn);

    expect(commands.deleteConversation).toHaveBeenCalledWith(2);
  });
});
