"use client";

import type React from "react";

import { useRef, useEffect, useState } from "react";
import MarkdownIt from "markdown-it";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, Sparkles, UserCircle2 } from "lucide-react";
import Image from "next/image";
import Logo from "@/public/logo.png";

const md = new MarkdownIt();

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [...messages, userMessage].map((msg) => ({
            role: msg.role,
            content: msg.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: "",
      };

      setMessages((prev) => [...prev, assistantMessage]);

      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;

        if (value) {
          const chunk = decoder.decode(value, { stream: true });
          console.log(" Raw chunk received:", chunk);
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const jsonStr = line.slice(6); // Remove "data: " prefix
                console.log("Parsing JSON:", jsonStr);
                if (jsonStr.trim() === "[DONE]") {
                  continue;
                }
                const data = JSON.parse(jsonStr);
                console.log("Parsed data object:", data);

                // Handle different types of SSE events from AI SDK
                if (data.type === "error") {
                  console.log("Processing error:", data.errorText);
                  let errorMessage =
                    "An error occurred while processing your request.";

                  if (data.errorText?.includes("Too many requests")) {
                    errorMessage =
                      "You're sending messages too quickly. Please wait a moment before trying again.";
                  } else if (data.errorText?.includes("rate limit")) {
                    errorMessage =
                      "Rate limit exceeded. Please wait a few seconds before sending another message.";
                  } else if (data.errorText) {
                    errorMessage = data.errorText;
                  }

                  setError(new Error(errorMessage));
                  // Remove empty assistant message
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    if (newMessages.length > 0) {
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (
                        lastMessage.role === "assistant" &&
                        lastMessage.content === ""
                      ) {
                        newMessages.pop();
                      }
                    }
                    return newMessages;
                  });
                  return; // Exit the processing loop
                } else if (data.type === "text-delta" && data.delta) {
                  console.log("Processing text-delta:", data.delta);
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === "assistant") {
                      lastMessage.content += data.delta;
                    }
                    return newMessages;
                  });
                } else if (data.type === "text" && data.text) {
                  setMessages((prev) => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === "assistant") {
                      lastMessage.content = data.text;
                    }
                    return newMessages;
                  });
                } else if (data.type === "start") {
                  // Stream initialization - no action needed
                  console.log("Stream started");
                } else if (data.type === "start-step") {
                  // Step initialization - no action needed
                  console.log("Step started");
                } else if (data.type === "text-start") {
                  // Text generation started - no action needed
                  console.log("Text generation started");
                } else if (data.type === "text-end") {
                  // Text generation ended - no action needed
                  console.log("Text generation ended");
                } else if (data.type === "finish-step") {
                  // Step finished - no action needed
                  console.log("Step finished");
                } else if (data.type === "finish") {
                  // Stream finished - no action needed
                  console.log("Stream finished");
                } else {
                  console.log("Unhandled data type:", data.type, data);
                }
              } catch (parseError) {
                console.error("Error parsing SSE chunk:", parseError);
                setError(
                  parseError instanceof Error
                    ? parseError
                    : new Error("An unknown error occurred")
                );
                setMessages((prev) => {
                  const newMessages = [...prev];
                  // Remove the last message if it's an assistant message with empty content
                  if (newMessages.length > 0) {
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (
                      lastMessage.role === "assistant" &&
                      lastMessage.content === ""
                    ) {
                      newMessages.pop();
                    }
                  }
                  return newMessages;
                });
              }
            } else if (line.trim()) {
              console.log("Non-data line:", line);
            }
          }
        }
      }
    } catch (err) {
      console.error("Chat error:", err);
      setError(
        err instanceof Error ? err : new Error("An unknown error occurred")
      );
      setMessages((prev) => {
        const newMessages = [...prev];
        // Remove the last message if it's an assistant message with empty content
        if (newMessages.length > 0) {
          const lastMessage = newMessages[newMessages.length - 1];
          if (lastMessage.role === "assistant" && lastMessage.content === "") {
            newMessages.pop();
          }
        }
        return newMessages;
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const showWelcomeMessage = messages.length === 0 && !isLoading && !error;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 selection:bg-red-400 selection:text-white">
      <Card className="w-full max-w-2xl h-[80vh] flex flex-col shadow-2xl rounded-xl overflow-hidden border-0">
        <CardContent className="flex-1 p-0 bg-white overflow-hidden">
          <ScrollArea ref={scrollAreaRef} className="h-full overflow-y-auto">
            <div
              className={`min-h-full flex flex-col transition-all duration-500 ease-in-out 
                ${
                  showWelcomeMessage
                    ? "items-center justify-center"
                    : "items-stretch justify-start pt-6"
                }`}
            >
              <div
                className={`text-center transition-all duration-500 ease-in-out ${
                  showWelcomeMessage ? "p-8" : "p-4 pt-0 pb-6"
                }`}
              >
                <div className="space-y-3 mt-4">
                  <div className="mx-auto p-2 bg-white rounded-full border-gray-300 border shadow-lg w-20 h-20 flex items-center justify-center">
                    <Image
                      src={Logo.src}
                      alt="Axiomkit Logo"
                      width={60}
                      height={60}
                      className="rounded-full"
                    />
                  </div>
                  <h3 className="text-2xl font-bold text-black">
                    Axiomkit Chatbot Demo X402
                  </h3>
                  <p className="text-md text-gray-600 max-w-md mx-auto">
                    {`Chat With Axiomkit. Ask me anything about`}
                  </p>
                </div>
              </div>

              {isLoading && messages.length === 0 && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 className="h-12 w-12 text-orange-500 animate-spin" />
                </div>
              )}

              {error && (
                <div className="flex-1 flex items-center justify-center text-center p-8">
                  <div className="space-y-3 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                    <Sparkles className="h-12 w-12 mx-auto text-red-500" />
                    <h3 className="text-xl font-semibold">
                      Oops! Something went wrong.
                    </h3>
                    <p className="text-sm">
                      {error.message || "Please try again later."}
                    </p>
                    {error.message?.includes("too quickly") ||
                    error.message?.includes("rate limit") ? (
                      <p className="text-xs text-red-600 mt-2">
                        💡 Tip: Wait 10-15 seconds between messages to avoid
                        rate limits.
                      </p>
                    ) : null}
                    <Button
                      onClick={() => setError(null)}
                      variant="destructive"
                      size="sm"
                    >
                      Try Again
                    </Button>
                  </div>
                </div>
              )}

              {messages.length > 0 && (
                <div className="space-y-6 w-full px-4 md:px-6 pb-8">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={`flex items-end gap-3 ${
                        message.role === "user"
                          ? "justify-end"
                          : "justify-start"
                      }`}
                    >
                      {message.role !== "user" && (
                        <Avatar
                          className={`h-10 w-10 border border-gray-300 shadow-md bg-white ${
                            isLoading &&
                            message.id === messages[messages.length - 1]?.id &&
                            messages[messages.length - 1].role !== "user"
                              ? "animate-pulse"
                              : ""
                          }`}
                        >
                          <AvatarImage
                            src="/logo.png"
                            alt="AI Avatar"
                            className="object-contain"
                          />
                          <AvatarFallback className="bg-orange-100 text-orange-600 text-xs">
                            AI
                          </AvatarFallback>
                        </Avatar>
                      )}
                      <div
                        className={`rounded-xl px-4 py-3 max-w-[75%] shadow-md 
                        ${
                          message.role === "user"
                            ? "bg-orange-500 text-white rounded-br-none"
                            : "bg-gray-100 text-gray-800 rounded-bl-none border border-gray-200"
                        }`}
                      >
                        <div
                          className="prose text-sm text-inherit prose-p:my-1 prose-ul:my-1 prose-ol:my-1"
                          dangerouslySetInnerHTML={{
                            __html: md.render(message.content),
                          }}
                        />
                      </div>
                      {message.role === "user" && (
                        <Avatar className="h-10 w-10 border-2 border-blue-200 shadow-md">
                          <AvatarFallback className="bg-blue-500 text-white">
                            <UserCircle2 className="h-5 w-5" />
                          </AvatarFallback>
                        </Avatar>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </CardContent>

        <CardFooter className="border-t border-gray-200 p-4 bg-gray-50">
          <form
            onSubmit={handleSubmit}
            className="flex w-full items-center gap-3"
          >
            <Input
              placeholder="Ask anything!"
              value={input}
              onChange={handleInputChange}
              className="flex-1 bg-white border-gray-300 focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 focus-visible:ring-offset-gray-50 text-gray-900 placeholder:text-gray-500 rounded-lg py-3 px-4"
              disabled={isLoading}
              aria-label="Chat input"
            />
            <Button
              type="submit"
              size="lg"
              className="bg-red-500 hover:bg-red-600 text-white rounded-lg px-5 py-3 shadow-md hover:shadow-lg transition-all duration-200 transform hover:-translate-y-0.5 disabled:bg-red-300 disabled:transform-none disabled:shadow-none"
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              {isLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Send className="h-5 w-5" />
              )}
            </Button>
          </form>
        </CardFooter>
      </Card>
    </div>
  );
}
