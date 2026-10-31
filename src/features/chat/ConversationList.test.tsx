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
        { id: 1, title: "Rust questions", updatedAt: 100, pinned: false, archived: false },
        { id: 2, title: "React notes", updatedAt: 90, pinned: false, archived: false },
      ],
      messages: [],
      streaming: false,
    });
  });

  it("opening a chat is a button of its own, beside its actions", () => {
    render(<ConversationList />);

    // A button inside a button is hidden from screen readers.
    const open = screen.getByRole("button", { name: /^Rust questions/ });
    expect(open.querySelector("button")).toBeNull();
    expect(open.getAttribute("aria-current")).toBe("true");
    expect(
      screen.getByRole("button", { name: /^React notes/ }).getAttribute("aria-current"),
    ).toBeNull();
  });

  it("the Archived toggle says whether it is open", () => {
    useChatStore.setState({
      conversations: [{ id: 3, title: "Old", updatedAt: 50, pinned: false, archived: true }],
    });
    render(<ConversationList />);

    const toggle = screen.getByRole("button", { name: /archived \(1\)/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
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

  it("pinned chats sit above recent ones", () => {
    useChatStore.setState({
      conversationId: 2,
      conversations: [
        { id: 1, title: "Pinned Chat", updatedAt: 100, pinned: true, archived: false },
        { id: 2, title: "Recent Chat", updatedAt: 200, pinned: false, archived: false },
      ],
    });
    render(<ConversationList />);

    const headings = screen.getAllByRole("heading").map((h) => h.textContent);
    expect(headings).toEqual(["Pinned", "Recent"]);

    const pinnedEl = screen.getByText("Pinned Chat");
    const recentEl = screen.getByText("Recent Chat");
    expect(pinnedEl.compareDocumentPosition(recentEl) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("Archive moves a chat into Archived", async () => {
    const setArchived = vi.fn();
    useChatStore.setState({
      conversationId: 1,
      conversations: [
        { id: 1, title: "My Chat", updatedAt: 100, pinned: false, archived: false },
      ],
      setArchived,
    });
    const { rerender } = render(<ConversationList />);

    const archiveBtn = screen.getByLabelText("Archive My Chat");
    fireEvent.click(archiveBtn);
    expect(setArchived).toHaveBeenCalledWith(1, true);

    useChatStore.setState({
      conversations: [
        { id: 1, title: "My Chat", updatedAt: 100, pinned: false, archived: true },
      ],
    });
    rerender(<ConversationList />);

    expect(screen.queryByText("My Chat")).toBeNull();
    const toggleArchived = screen.getByRole("button", { name: /archived \(1\)/i });
    expect(toggleArchived).toBeDefined();

    fireEvent.click(toggleArchived);
    expect(screen.getByText("My Chat")).toBeDefined();
    expect(screen.getByLabelText("Unarchive My Chat")).toBeDefined();
    expect(screen.getByLabelText("Delete My Chat")).toBeDefined();
  });

  it("the filter applies to pinned, recent and archived chats", () => {
    useChatStore.setState({
      conversationId: 1,
      conversations: [
        { id: 1, title: "Pin Apple", updatedAt: 100, pinned: true, archived: false },
        { id: 2, title: "Recent Banana", updatedAt: 90, pinned: false, archived: false },
        { id: 3, title: "Archived Apricot", updatedAt: 80, pinned: false, archived: true },
      ],
    });
    render(<ConversationList />);

    const filterInput = screen.getByPlaceholderText(/filter/i);
    fireEvent.change(filterInput, { target: { value: "ap" } });

    expect(screen.getByText("Pin Apple")).toBeDefined();
    expect(screen.queryByText("Recent Banana")).toBeNull();
    const archivedBtn = screen.getByRole("button", { name: /archived \(1\)/i });
    fireEvent.click(archivedBtn);
    expect(screen.getByText("Archived Apricot")).toBeDefined();
  });

  it("while a reply streams, archive and delete are disabled and pin is not", () => {
    useChatStore.setState({
      conversationId: 1,
      conversations: [
        { id: 1, title: "Chat One", updatedAt: 100, pinned: false, archived: false },
      ],
      streaming: true,
    });
    render(<ConversationList />);

    const pinBtn = screen.getByLabelText("Pin Chat One") as HTMLButtonElement;
    expect(pinBtn.disabled).toBe(false);

    const archiveBtn = screen.getByLabelText("Archive Chat One") as HTMLButtonElement;
    expect(archiveBtn.disabled).toBe(true);

    const deleteBtn = screen.getByLabelText("Delete Chat One") as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(true);
  });
});

describe("ConversationList while a reply streams", () => {
  it("can't switch, create or delete chats", () => {
    // Switching mid-reply lost the reply from history (review of Task 6).
    const load = vi.fn();
    const startNew = vi.fn();
    useChatStore.setState({
      conversationId: 1,
      conversations: [
        { id: 1, title: "Rust questions", updatedAt: 100, pinned: false, archived: false },
        { id: 2, title: "React notes", updatedAt: 90, pinned: false, archived: false },
      ],
      messages: [],
      streaming: true,
      load,
      startNew,
    });
    render(<ConversationList />);

    fireEvent.click(screen.getByText("React notes"));
    expect(load).not.toHaveBeenCalled();
    const newChat = screen.getByRole("button", { name: /new chat/i }) as HTMLButtonElement;
    expect(newChat.disabled).toBe(true);
    const del = screen.getByRole("button", { name: "Delete React notes" }) as HTMLButtonElement;
    expect(del.disabled).toBe(true);
  });
});
