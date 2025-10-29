/* eslint-disable @typescript-eslint/no-explicit-any */
import { seiAgentContext, seiProvider, seiWallet } from "@/lib/axiom-config";
import { groq } from "@ai-sdk/groq";
import { createAgent, LogLevel } from "@axiomkit/core";
import { NextRequest } from "next/server";

export async function POST(req: NextRequest) {
  const { messages } = await req.json();

  // Extract the latest user message content
  const lastUserMessage = Array.isArray(messages)
    ? [...messages].reverse().find((m) => m.role === "user")?.content ?? ""
    : "";

  if (!lastUserMessage) {
    return new Response(JSON.stringify({ error: "No user message found" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Initialize agent with streaming enabled
  const seiAxiom = createAgent({
    logLevel: LogLevel.DISABLED,
    model: groq("openai/gpt-oss-20b"),
    providers: [seiProvider],
  });

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      try {
        send({ type: "start" });

        // Start the agent
        seiAxiom.start();

        // Run the agent with user input
        const response = await seiAxiom.run({
          context: seiAgentContext,
          args: {
            wallet: seiWallet.walletAdress,
            userMessage: lastUserMessage,
          },
        });

        // Stream the agent's response
        let responseText = "";

        // Ensure response is an array
        if (Array.isArray(response)) {
          // Find all 'text' output items with 'content'
          const textOutputs = response.filter(
            (item: any) => item.name === "text" && item.content
          );

          // Use the last matching 'text' output, if present
          if (textOutputs.length > 0) {
            const lastTextOutput = textOutputs[textOutputs.length - 1] as any;

            try {
              const parsed = JSON.parse(lastTextOutput.content);
              responseText = parsed.content ?? lastTextOutput.content;
            } catch {
              responseText = lastTextOutput.content;
            }
          } else {
            // Fallback: Check for action_result with weather data
            const weatherResult: any = response
              .filter(
                (item: any) => item.name === "getWeather" && item.data?.content
              )
              .pop();
            if (weatherResult) {
              responseText = weatherResult.data.content;
            } else {
              // Fallback: Any action_result with content
              const actionResult: any = response
                .filter(
                  (item: any) =>
                    item.ref === "action_result" && item.data?.content
                )
                .pop();
              if (actionResult) {
                responseText = actionResult.data.content;
              }
            }
          }
        } else if (response && typeof response === "object") {
          responseText =
            (response as any).text || (response as any).content || "";
        }

        if (responseText) {
          console.log("Response", responseText);
          send({ type: "text", text: responseText });
        } else {
          // Fallback response if agent doesn't return expected format
          const fallbackResponse = `I understand you said: "${lastUserMessage}". I'm a SEI blockchain assistant. I can help you with:        
- Check wallet balances
- Transfer SEI tokens
- Get current SEI price
- Answer questions about SEI blockchain
- Get Weather Data (x402 API)
What would you like me to help you with?`;
          send({ type: "text", text: fallbackResponse });
        }

        send({ type: "finish" });
      } catch (error) {
        console.error("Agent error:", error);
        const errorMessage = `I encountered an error processing your request: "${lastUserMessage}". Please try again or ask me something else about SEI blockchain.`;
        send({ type: "text", text: errorMessage });
        send({ type: "finish" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
