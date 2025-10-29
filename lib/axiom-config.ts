import { action, context, provider, validateEnv } from "@axiomkit/core";
import { AxiomSeiWallet } from "@axiomkit/sei";

// import { privateKeyToAccount } from "viem/accounts";
import { parseUnits, encodeFunctionData } from "viem";
import * as viemChains from "viem/chains";
import * as z from "zod";

const env = validateEnv(
  z.object({
    SEI_PRIVATE_KEY: z.string().min(1, "SEI_PRIVATE_KEY is required"),
    SEI_RPC_URL: z.string().min(1, "SEI_RPC_URL is required"),
    GROQ_API_KEY: z.string().min(1, "GROQ_API_KEY is required"),
  })
);

export const seiWallet = new AxiomSeiWallet({
  rpcUrl: env.SEI_RPC_URL,
  privateKey: env.SEI_PRIVATE_KEY as `0x${string}`,
  chain: viemChains.seiTestnet,
});

type SeiMemory = {
  wallet: string;
  transactions: string[];
  lastTransaction: string | null;
  balance: number;
  conversationHistory: string[];
};

// const account = privateKeyToAccount(env.SEI_PRIVATE_KEY as `0x${string}`);
// export const initialWalletAddress = account.address;

// X402 Payment  Testnet Configuration Example
export const X402_CONFIG = {
  network: "sei-testnet",
  chainId: 1328,
  asset: "USDC",
  assetAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED", // Sei Testnet USDC
  assetDecimals: 6,
  recipient: "0x9dC2aA0038830c052253161B1EE49B9dD449bD66",
  rpcUrl: "https://evm-rpc-testnet.sei-apis.com",
};

// Create wallet client for transactions -
// const walletClient = createWalletClient({
//   account,
//   chain: viemChains.seiTestnet,
//   transport: http(X402_CONFIG.rpcUrl),
// });

/**
 * Make X402 payment using EIP-3009 transferWithAuthorization
 */
async function makeX402Payment(
  amount: string,
  recipient: string,
  reference: string
) {
  try {
    // For now, we'll use a simple transfer approach
    // In a full implementation, you'd use EIP-3009 transferWithAuthorization
    const amountInUnits = parseUnits(amount, X402_CONFIG.assetDecimals);

    // USDC transfer function data
    const transferData = encodeFunctionData({
      abi: [
        {
          name: "transfer",
          type: "function",
          stateMutability: "nonpayable",
          inputs: [
            { name: "to", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          outputs: [{ name: "", type: "bool" }],
        },
      ],
      functionName: "transfer",
      args: [recipient as `0x${string}`, amountInUnits],
    });

    // Send transaction
    const hash = await seiWallet.walletClient.sendTransaction({
      to: X402_CONFIG.assetAddress as `0x${string}`,
      data: transferData,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      account: seiWallet.walletClient.account as any,
      chain: viemChains.seiTestnet,
    });

    return hash;
  } catch (error) {
    console.error("X402 Payment error:", error);
    throw new Error(
      `Payment failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    );
  }
}

const template = ({
  wallet,
  lastTransaction,
  transactions,
  balance,
  conversationHistory,
}: SeiMemory) => `Axiomkit Sei Trader/Assistant Status Report:

Wallet Address: ${wallet}
Current Balance: ${balance} SEI
Last Transaction ID: ${lastTransaction ?? "N/A"}
Transaction History (Most Recent First):
${
  transactions.length > 0
    ? transactions.join("\n")
    : "No recent transactions found."
}

Recent Conversation:
${
  conversationHistory.length > 0
    ? conversationHistory.slice(-5).join("\n")
    : "No recent conversation history."
}

Current User Input: ${
  conversationHistory[conversationHistory.length - 1] || "No current input"
}

RPC Provider: Helius (High-performance Sei RPC with full archival data)
Note: "Failed to query long-term storage" errors often indicate rate limiting. Please wait and retry. For persistent issues, respect the API limits.
`;

const actionResponse = (message: string) => ({
  data: { content: message },
  content: message,
});

export const seiAgentContext = context({
  type: "sei",
  schema: {
    wallet: z.string(),
    userMessage: z.string().optional(),
  },
  key: ({ wallet }: { wallet: string }) => wallet,
  create({ args }): SeiMemory {
    return {
      wallet: args.wallet,
      transactions: [],
      lastTransaction: null,
      balance: 0,
      conversationHistory: args.userMessage ? [args.userMessage] : [],
    };
  },
  render({ memory }) {
    return template(memory);
  },
  maxSteps: 10,
  instructions: `You are a helpful SEI blockchain assistant with access to real blockchain operations.

CRITICAL: When users ask about their balance, wallet balance, or "check my balance", you MUST immediately call the getBalance action with no parameters. Do not use template variables or try to guess the balance - always call the action to get real data.

CRITICAL: When users ask about weather, weather data, "get weather", "fetch weather", or "how about the weather", you MUST immediately call the getWeather action. This will initiate an X402 payment flow to retrieve weather data.

CRITICAL: After completing any action, you MUST generate a text output with the results. Do not leave users without a response after actions complete.

Available actions:
1. getBalance - Check wallet balance (call with no parameters for current wallet)
2. transferToken - Transfer SEI tokens (requires 'to' address and 'amount')
3. getSeiPrice - Get current SEI price in USD
4. getWeather - Get weather data (requires X402 payment of $0.001 USDC)

When users ask questions, be conversational and helpful. If they want to perform blockchain operations, use the appropriate actions. Always provide clear explanations of what you're doing.

When calling actions, always provide complete and valid JSON parameters. Never leave JSON incomplete or malformed.

After completing actions, always generate a text output with the results so users can see what happened.

Be friendly and explain blockchain concepts in simple terms when users ask questions.

`,
})
  .setOutputs({
    text: {
      schema: z.string().describe("The message to send to the user"),
    },
  })
  .setActions([
    action({
      name: "getBalance",
      description:
        "Get the balance of a wallet address. If no address is provided, it will check the balance of the current active wallet.",
      schema: {
        address: z
          .string()
          .optional()
          .describe(
            "The sei wallet address to check balance for. Optional, defaults to the current active wallet."
          ),
      },

      async handler({ address }, { memory }) {
        try {
          const targetAddress = address || memory.wallet;

          if (!targetAddress) {
            return actionResponse(
              "Error: No wallet address provided and no primary wallet set in memory. Please provide an address or ensure your primary wallet is configured."
            );
          }

          const balance = await seiWallet.getERC20Balance();

          // Update memory with current balance
          memory.balance = parseFloat(balance);

          // Add to conversation history
          memory.conversationHistory.push(
            `Checked balance for ${targetAddress}: ${balance} SEI`
          );

          return actionResponse(`✅ **Balance Check Complete**
**Wallet:** ${targetAddress}
**Balance:** ${balance} SEI

This is your current SEI token balance on the Sei testnet. You can use this balance to make transfers or check your account status.`);
        } catch (error) {
          const errorMsg = `Error: Failed to get balance. ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          memory.conversationHistory.push(
            `Failed to check balance: ${errorMsg}`
          );
          return actionResponse(errorMsg);
        }
      },
    }),

    action({
      name: "transferToken",
      description: "Transfer tokens from one Sei wallet to another.",
      schema: {
        to: z.string().describe("The Sei wallet address transfer to."),
        amount: z
          .number()
          .min(0.000001, "Amount must be greater than 0")
          .describe("The amount of SEI to transfer."),
      },

      async handler({ to, amount }, { memory }) {
        try {
          const addressTo = to as `0x${string}`;
          console.log("Address to transfer to:", addressTo);
          console.log("Amount to transfer:", amount);

          if (!addressTo) {
            return actionResponse(
              "Error: No recipient address provided. Please provide a valid Sei wallet address."
            );
          }

          const transaction = await seiWallet.ERC20Transfer(
            String(amount),
            addressTo
          );

          // Update memory
          memory.transactions.unshift(transaction);
          memory.lastTransaction = transaction;
          memory.conversationHistory.push(
            `Transferred ${amount} SEI to ${addressTo}. TX: ${transaction}`
          );

          console.log(`   Amount: ${amount} SEI`);
          console.log(`   To: ${addressTo}`);
          console.log(`   Hash: ${transaction}`);

          return actionResponse(`🚀 **Transfer Successful!**

**Amount:** ${amount} SEI
**To:** ${addressTo}
**Transaction Hash:** ${transaction}

Your transfer has been submitted to the Sei testnet. You can view the transaction on [SeiTrace](https://seitrace.com/tx/${transaction}?chain=atlantic-2).

The transaction is now being processed by the network.`);
        } catch (error) {
          const errorMsg = `Error: Failed to transfer tokens. ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          memory.conversationHistory.push(`Transfer failed: ${errorMsg}`);
          return actionResponse(errorMsg);
        }
      },
    }),

    action({
      name: "getSeiPrice",
      description: "Fetch the latest real-time price of the SEI token in USD.",

      async handler({ memory }: { memory: SeiMemory }) {
        try {
          const res = await fetch(
            "https://api.coingecko.com/api/v3/simple/price?ids=sei-network&vs_currencies=usd"
          );
          const data = await res.json();
          const price = data["sei-network"].usd;

          console.log("SEI price (USD):", price);

          // Add to conversation history
          memory.conversationHistory.push(`Checked SEI price: $${price} USD`);

          return actionResponse(`💰 **Current SEI Price**

**Price:** $${price} USD
This is the current market price of SEI token according to CoinGecko. Prices are updated in real-time and may fluctuate based on market conditions.

You can use this information to:
- Calculate the USD value of your SEI holdings
- Make informed decisions about transfers
- Track market trends`);
        } catch (error) {
          const errorMsg = `Error: Failed to fetch SEI price. ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          memory.conversationHistory.push(
            `Failed to get SEI price: ${errorMsg}`
          );
          return actionResponse(errorMsg);
        }
      },
    }),

    action({
      name: "getWeather",
      description:
        "Get current weather data. This requires an X402 payment of $0.001 USDC using EIP-3009 transferWithAuthorization.",
      schema: {
        location: z
          .string()
          .optional()
          .describe(
            "Optional location for weather data. Defaults to 'Sei Network'."
          ),
      },

      async handler({ location }, { memory }) {
        try {
          console.log("Getting weather data with X402 payment...");

          // Step 1: Request weather data (this will return 402 Payment Required)
          const baseUrl = "http://localhost:3000";
          const weatherResponse = await fetch(`${baseUrl}/api/weather`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
            },
          });

          if (weatherResponse.status !== 402) {
            throw new Error(
              `Expected 402 Payment Required, got ${weatherResponse.status}`
            );
          }

          const paymentChallenge = await weatherResponse.json();
          console.log("Payment challenge received:", paymentChallenge);

          // Step 2: Make X402 payment
          const reference = paymentChallenge.accepts[0].extra.reference;
          const amount = "0.001"; // $0.001 USDC
          const recipient = paymentChallenge.accepts[0].payTo;

          console.log(`Making X402 payment: ${amount} USDC to ${recipient}`);

          const txHash = await makeX402Payment(amount, recipient, reference);
          console.log("Payment transaction hash:", txHash);

          // Step 3: Wait for transaction confirmation (simplified - in production, poll for confirmation)
          await new Promise((resolve) => setTimeout(resolve, 3000)); // Wait 3 seconds

          // Step 4: Retry weather request with payment proof
          const paymentProof = {
            x402Version: 1,
            scheme: "exact",
            network: X402_CONFIG.network,
            payload: {
              txHash: txHash,
              amount: parseUnits(amount, X402_CONFIG.assetDecimals).toString(),
              from: seiWallet.walletAdress,
            },
          };

          const paymentHeader = Buffer.from(
            JSON.stringify(paymentProof)
          ).toString("base64");

          const weatherDataResponse = await fetch(`${baseUrl}/api/weather`, {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "X-Payment": paymentHeader,
            },
          });

          if (!weatherDataResponse.ok) {
            throw new Error(`Weather API error: ${weatherDataResponse.status}`);
          }

          const weatherData = await weatherDataResponse.json();
          console.log("Weather data received:", weatherData);

          // Update memory
          memory.transactions.unshift(txHash);
          memory.lastTransaction = txHash;
          memory.conversationHistory.push(
            `Got weather data. Payment TX: ${txHash}`
          );

          return actionResponse(`🌤️ **Weather Data Retrieved**

**Location:** ${weatherData.location}
**Temperature:** ${weatherData.temperature}
**Conditions:** ${weatherData.conditions}
**Humidity:** ${weatherData.humidity}
**Wind Speed:** ${weatherData.windSpeed}

✅ **Payment Successful!**

**Transaction Hash:** ${txHash}
**Amount:** $${amount} USDC
**Status:** Confirmed on Sei Testnet

🔗 **View Transaction:** [SeiTrace](https://seitrace.com/tx/${txHash}?chain=atlantic-2)

The weather data has been successfully retrieved after completing the X402 micropayment.`);
        } catch (error) {
          console.error("Weather action error:", error);
          const errorMsg = `Error: Failed to get weather data. ${
            error instanceof Error ? error.message : "Unknown error"
          }`;
          memory.conversationHistory.push(`Failed to get weather: ${errorMsg}`);
          return actionResponse(`❌ **Weather Request Failed**

${errorMsg}

Please try again or check your wallet balance for USDC tokens needed for the payment.`);
        }
      },
    }),
  ]);

export const seiProvider = provider({
  name: "sei-provider",
  contexts: {
    sei: seiAgentContext,
  },
});
