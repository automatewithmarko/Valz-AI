"use client";

import { useState, useCallback, useRef } from "react";
import type { Chat, Message, User } from "@/lib/types";
import { generateChatTitle } from "@/lib/mock-responses";

const initialChats: Chat[] = [];

const initialUser: User = {
  id: "1",
  name: "Marko Filipovic",
  email: "marko@valz.ai",
  credits: 2450,
  maxCredits: 5000,
  brandDNA: {
    configured: false,
    brandName: "",
    status: "not_configured",
    documents: [
      { label: "ICP", fileName: null },
      { label: "Brand Guidelines", fileName: null },
      { label: "Competitor Analysis", fileName: null },
      { label: "Market Research", fileName: null },
      { label: "Value Proposition", fileName: null },
      { label: "Brand Story", fileName: null },
    ],
  },
};

async function streamResponse(
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  abortSignal?: AbortSignal
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
    signal: abortSignal,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error: ${error}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith("data: ")) continue;
      const data = trimmed.slice(6);
      if (data === "[DONE]") continue;

      try {
        const parsed = JSON.parse(data);
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          fullContent += delta;
          onChunk(fullContent);
        }
      } catch {
        // skip malformed chunks
      }
    }
  }

  return fullContent;
}

export function useChat() {
  const [chats, setChats] = useState<Chat[]>(initialChats);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [user, setUser] = useState<User>(initialUser);
  const [isGenerating, setIsGenerating] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  const createNewChat = useCallback(() => {
    setActiveChatId(null);
  }, []);

  const selectChat = useCallback((chatId: string) => {
    setActiveChatId(chatId);
  }, []);

  const deleteChat = useCallback(
    (chatId: string) => {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }
    },
    [activeChatId]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (isGenerating) return;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
      };

      let chatId = activeChatId;
      let currentMessages: { role: string; content: string }[] = [];

      if (!chatId) {
        chatId = `chat-${Date.now()}`;
        const newChat: Chat = {
          id: chatId,
          title: generateChatTitle(content),
          messages: [userMessage],
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        setChats((prev) => [newChat, ...prev]);
        setActiveChatId(chatId);
        currentMessages = [{ role: "user", content }];
      } else {
        setChats((prev) =>
          prev.map((c) => {
            if (c.id === chatId) {
              const updated = { ...c, messages: [...c.messages, userMessage], updatedAt: new Date() };
              currentMessages = updated.messages.map((m) => ({ role: m.role, content: m.content }));
              return updated;
            }
            return c;
          })
        );
        if (currentMessages.length === 0) {
          // Fallback: build from existing chat
          const chat = chats.find((c) => c.id === chatId);
          currentMessages = [
            ...(chat?.messages.map((m) => ({ role: m.role, content: m.content })) || []),
            { role: "user", content },
          ];
        }
      }

      setIsGenerating(true);

      const assistantMsgId = `msg-${Date.now()}-ai`;
      const currentChatId = chatId;

      // Add empty assistant message
      setChats((prev) =>
        prev.map((c) =>
          c.id === currentChatId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { id: assistantMsgId, role: "assistant" as const, content: "", timestamp: new Date() },
                ],
              }
            : c
        )
      );

      try {
        const abort = new AbortController();
        abortRef.current = abort;

        await streamResponse(
          currentMessages,
          (text) => {
            setChats((prev) =>
              prev.map((c) =>
                c.id === currentChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId ? { ...m, content: text } : m
                      ),
                      updatedAt: new Date(),
                    }
                  : c
              )
            );
          },
          abort.signal
        );

        setUser((prev) => ({
          ...prev,
          credits: Math.max(0, prev.credits - 1),
        }));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Update assistant message with error
          setChats((prev) =>
            prev.map((c) =>
              c.id === currentChatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, content: "Sorry, something went wrong. Please try again." }
                        : m
                    ),
                  }
                : c
            )
          );
        }
      } finally {
        abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [activeChatId, isGenerating, chats]
  );

  const regenerateLastResponse = useCallback(async () => {
    if (!activeChat || isGenerating) return;
    const messages = activeChat.messages;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    // Remove the last assistant message
    setChats((prev) =>
      prev.map((c) => {
        if (c.id !== activeChatId) return c;
        const idx = c.messages.findLastIndex((m) => m.role === "assistant");
        if (idx === -1) return c;
        return {
          ...c,
          messages: c.messages.slice(0, idx),
        };
      })
    );

    // Build message history up to the last user message
    const historyUpToLastUser = messages
      .slice(0, messages.findLastIndex((m) => m.role === "user") + 1)
      .map((m) => ({ role: m.role, content: m.content }));

    setIsGenerating(true);

    const assistantMsgId = `msg-${Date.now()}-regen`;
    const currentChatId = activeChatId;

    // Add empty assistant message
    setChats((prev) =>
      prev.map((c) =>
        c.id === currentChatId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { id: assistantMsgId, role: "assistant" as const, content: "", timestamp: new Date() },
              ],
            }
          : c
      )
    );

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      await streamResponse(
        historyUpToLastUser,
        (text) => {
          setChats((prev) =>
            prev.map((c) =>
              c.id === currentChatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMsgId ? { ...m, content: text } : m
                    ),
                    updatedAt: new Date(),
                  }
                : c
            )
          );
        },
        abort.signal
      );

      setUser((prev) => ({
        ...prev,
        credits: Math.max(0, prev.credits - 1),
      }));
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setChats((prev) =>
          prev.map((c) =>
            c.id === currentChatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: "Sorry, something went wrong. Please try again." }
                      : m
                  ),
                }
              : c
          )
        );
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, [activeChat, activeChatId, isGenerating]);

  const updateBrandDNADocument = useCallback(
    (index: number, fileName: string) => {
      setUser((prev) => {
        const docs = [...prev.brandDNA.documents];
        docs[index] = { ...docs[index], fileName };
        const allUploaded = docs.every((d) => d.fileName !== null);
        return {
          ...prev,
          brandDNA: {
            ...prev.brandDNA,
            documents: docs,
            configured: allUploaded,
            status: allUploaded ? "active" : "not_configured",
            brandName: allUploaded ? prev.name : prev.brandDNA.brandName,
          },
        };
      });
    },
    []
  );

  return {
    chats,
    activeChat,
    activeChatId,
    user,
    isGenerating,
    createNewChat,
    selectChat,
    deleteChat,
    sendMessage,
    regenerateLastResponse,
    updateBrandDNADocument,
  };
}
