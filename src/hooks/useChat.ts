"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Chat, Message } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  getChats,
  getChatMessages,
  createChat as dbCreateChat,
  deleteChat as dbDeleteChat,
  insertChatMessage,
  updateChatMessage,
} from "@/lib/supabase/db";
import { generateChatTitle } from "@/lib/mock-responses";

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
  const { user, refreshUser } = useAuth();
  const [supabase] = useState(() => createClient());
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const activeChat = chats.find((c) => c.id === activeChatId) ?? null;

  // Load chats from Supabase on mount
  useEffect(() => {
    if (!user || loaded) return;

    const loadChats = async () => {
      try {
        const dbChats = await getChats(supabase, user.id);
        const chatList: Chat[] = dbChats.map((c) => ({
          id: c.id,
          title: c.title,
          messages: [], // load lazily
          createdAt: new Date(c.created_at),
          updatedAt: new Date(c.updated_at),
        }));
        setChats(chatList);
        setLoaded(true);
      } catch (err) {
        console.error("Failed to load chats:", err);
        setLoaded(true);
      }
    };

    loadChats();
  }, [user, loaded, supabase]);

  // Refresh chat list when tab regains focus (merge without losing loaded messages)
  useEffect(() => {
    if (!user || !loaded) return;

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const dbChats = await getChats(supabase, user.id);
        setChats((prev) => {
          const existingById = new Map(prev.map((c) => [c.id, c]));
          return dbChats.map((c) => {
            const existing = existingById.get(c.id);
            return {
              id: c.id,
              title: c.title,
              messages: existing?.messages ?? [],
              createdAt: new Date(c.created_at),
              updatedAt: new Date(c.updated_at),
            };
          });
        });
      } catch (err) {
        console.error("Failed to refresh chats:", err);
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [user, loaded, supabase]);

  // Load messages when selecting a chat
  const selectChat = useCallback(
    async (chatId: string) => {
      setActiveChatId(chatId);

      // Check if we already have messages loaded for this chat
      const chat = chats.find((c) => c.id === chatId);
      if (chat && chat.messages.length > 0) return;

      try {
        const messages = await getChatMessages(supabase, chatId);
        const mappedMessages: Message[] = messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          timestamp: new Date(m.created_at),
        }));

        setChats((prev) =>
          prev.map((c) =>
            c.id === chatId ? { ...c, messages: mappedMessages } : c
          )
        );
      } catch (err) {
        console.error("Failed to load messages:", err);
      }
    },
    [chats, supabase]
  );

  const createNewChat = useCallback(() => {
    setActiveChatId(null);
  }, []);

  const deleteChat = useCallback(
    async (chatId: string) => {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      if (activeChatId === chatId) {
        setActiveChatId(null);
      }

      try {
        await dbDeleteChat(supabase, chatId);
      } catch (err) {
        console.error("Failed to delete chat:", err);
      }
    },
    [activeChatId, supabase]
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (isGenerating || !user) return;

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
      };

      let chatId = activeChatId;
      let currentMessages: { role: string; content: string }[] = [];

      if (!chatId) {
        // Create new chat in DB
        try {
          const title = generateChatTitle(content);
          const newDbChat = await dbCreateChat(supabase, user.id, title);
          chatId = newDbChat.id;

          const newChat: Chat = {
            id: chatId,
            title,
            messages: [userMessage],
            createdAt: new Date(newDbChat.created_at),
            updatedAt: new Date(newDbChat.updated_at),
          };
          setChats((prev) => [newChat, ...prev]);
          setActiveChatId(chatId);
          currentMessages = [{ role: "user", content }];

          // Save user message to DB
          const savedMsg = await insertChatMessage(supabase, {
            chat_id: chatId,
            user_id: user.id,
            role: "user",
            content,
          });
          // Update the message ID to the DB one
          userMessage.id = savedMsg.id;
          setChats((prev) =>
            prev.map((c) =>
              c.id === chatId
                ? { ...c, messages: c.messages.map((m) => (m.id === `msg-${Date.now()}` ? { ...m, id: savedMsg.id } : m)) }
                : c
            )
          );
        } catch (err) {
          console.error("Failed to create chat:", err);
          return;
        }
      } else {
        // Add to existing chat
        setChats((prev) =>
          prev.map((c) => {
            if (c.id === chatId) {
              const updated = {
                ...c,
                messages: [...c.messages, userMessage],
                updatedAt: new Date(),
              };
              currentMessages = updated.messages.map((m) => ({
                role: m.role,
                content: m.content,
              }));
              return updated;
            }
            return c;
          })
        );
        if (currentMessages.length === 0) {
          const chat = chats.find((c) => c.id === chatId);
          currentMessages = [
            ...(chat?.messages.map((m) => ({
              role: m.role,
              content: m.content,
            })) || []),
            { role: "user", content },
          ];
        }

        // Save user message to DB
        try {
          const savedMsg = await insertChatMessage(supabase, {
            chat_id: chatId,
            user_id: user.id,
            role: "user",
            content,
          });
          userMessage.id = savedMsg.id;
        } catch (err) {
          console.error("Failed to save user message:", err);
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
                  {
                    id: assistantMsgId,
                    role: "assistant" as const,
                    content: "",
                    timestamp: new Date(),
                  },
                ],
              }
            : c
        )
      );

      try {
        const abort = new AbortController();
        abortRef.current = abort;

        const finalContent = await streamResponse(
          currentMessages,
          (text) => {
            setChats((prev) =>
              prev.map((c) =>
                c.id === currentChatId
                  ? {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, content: text }
                          : m
                      ),
                      updatedAt: new Date(),
                    }
                  : c
              )
            );
          },
          abort.signal
        );

        // Save assistant message to DB
        try {
          const savedAssistant = await insertChatMessage(supabase, {
            chat_id: currentChatId!,
            user_id: user.id,
            role: "assistant",
            content: finalContent,
          });

          // Update local message with DB id
          setChats((prev) =>
            prev.map((c) =>
              c.id === currentChatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMsgId
                        ? { ...m, id: savedAssistant.id }
                        : m
                    ),
                  }
                : c
            )
          );
        } catch (err) {
          console.error("Failed to save assistant message:", err);
        }

        // Decrement credit via API
        try {
          await supabase.rpc("decrement_credit", { user_uuid: user.id });
          refreshUser();
        } catch (err) {
          console.error("Failed to decrement credit:", err);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setChats((prev) =>
            prev.map((c) =>
              c.id === currentChatId
                ? {
                    ...c,
                    messages: c.messages.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content:
                              "Sorry, something went wrong. Please try again.",
                          }
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
    [activeChatId, isGenerating, chats, user, supabase, refreshUser]
  );

  const regenerateLastResponse = useCallback(async () => {
    if (!activeChat || isGenerating || !user) return;
    const messages = activeChat.messages;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg) return;

    // Remove the last assistant message
    const lastAssistantIdx = messages.findLastIndex(
      (m) => m.role === "assistant"
    );
    const lastAssistantId =
      lastAssistantIdx >= 0 ? messages[lastAssistantIdx].id : null;

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

    // Delete the old assistant message from DB
    if (lastAssistantId && !lastAssistantId.startsWith("msg-")) {
      try {
        await supabase
          .from("chat_messages")
          .delete()
          .eq("id", lastAssistantId);
      } catch (err) {
        console.error("Failed to delete old assistant message:", err);
      }
    }

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
                {
                  id: assistantMsgId,
                  role: "assistant" as const,
                  content: "",
                  timestamp: new Date(),
                },
              ],
            }
          : c
      )
    );

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const finalContent = await streamResponse(
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

      // Save to DB
      try {
        const savedAssistant = await insertChatMessage(supabase, {
          chat_id: currentChatId!,
          user_id: user.id,
          role: "assistant",
          content: finalContent,
        });
        setChats((prev) =>
          prev.map((c) =>
            c.id === currentChatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, id: savedAssistant.id }
                      : m
                  ),
                }
              : c
          )
        );
      } catch (err) {
        console.error("Failed to save regenerated message:", err);
      }

      // Decrement credit
      try {
        await supabase.rpc("decrement_credit", { user_uuid: user.id });
        refreshUser();
      } catch (err) {
        console.error("Failed to decrement credit:", err);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setChats((prev) =>
          prev.map((c) =>
            c.id === currentChatId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content:
                            "Sorry, something went wrong. Please try again.",
                        }
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
  }, [activeChat, activeChatId, isGenerating, user, supabase, refreshUser]);

  const updateBrandDNADocument = useCallback(
    (index: number, fileName: string) => {
      // Brand DNA documents are managed separately; this is kept for compatibility
      console.log("updateBrandDNADocument", index, fileName);
    },
    []
  );

  const setBrandDNAComplete = useCallback(() => {
    refreshUser();
  }, [refreshUser]);

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
    setBrandDNAComplete,
  };
}
