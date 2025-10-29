/* eslint-disable @typescript-eslint/no-explicit-any */
import { X402_CONFIG } from "@/lib/axiom-config";
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, http, parseUnits } from "viem";

// Configuration for Sei Testnet

// Create Viem client for Sei Testnet
const publicClient = createPublicClient({
  chain: {
    id: X402_CONFIG.chainId,
    name: "Sei Testnet",
    network: X402_CONFIG.network,
    nativeCurrency: {
      decimals: 18,
      name: "SEI",
      symbol: "SEI",
    },
    rpcUrls: {
      default: {
        http: [X402_CONFIG.rpcUrl],
      },
      public: {
        http: [X402_CONFIG.rpcUrl],
      },
    },
  },
  transport: http(X402_CONFIG.rpcUrl),
});

// Payment verification storage (in production, use a database)
const verifiedPayments = new Map();

/**
 * Generate payment challenge for 402 response
 */
function generatePaymentChallenge() {
  const reference = `sei-${Date.now()}-${Math.random()
    .toString(36)
    .substring(7)}`;
  const amountInUnits = parseUnits("0.001", X402_CONFIG.assetDecimals); // $0.001 USDC

  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: X402_CONFIG.network,
        maxAmountRequired: amountInUnits.toString(),
        resource: "/api/weather",
        description: "Get current weather data",
        mimeType: "application/json",
        payTo: X402_CONFIG.recipient,
        maxTimeoutSeconds: 300,
        asset: X402_CONFIG.assetAddress,
        extra: {
          name: X402_CONFIG.asset,
          version: "2", // USDC version
          reference: reference,
        },
      },
    ],
  };
}

/**
 * Verify payment on Sei blockchain
 */
async function verifyPayment(paymentHeader: string) {
  try {
    // Parse the X-PAYMENT header (base64 encoded JSON)
    const paymentData = JSON.parse(
      Buffer.from(paymentHeader, "base64").toString()
    );

    // Extract payment details
    const { x402Version, scheme, network, payload } = paymentData;

    // Validate basic requirements
    if (
      x402Version !== 1 ||
      scheme !== "exact" ||
      network !== X402_CONFIG.network
    ) {
      return { isValid: false, reason: "Invalid payment format or network" };
    }

    // For 'exact' scheme, verify the transaction on-chain
    if (payload.txHash) {
      // Check if we've already verified this payment
      if (verifiedPayments.has(payload.txHash)) {
        return { isValid: true, cached: true };
      }

      // Verify transaction on Sei
      const receipt = await publicClient.getTransactionReceipt({
        hash: payload.txHash as `0x${string}`,
      });

      if (!receipt || receipt.status !== "success") {
        return { isValid: false, reason: "Transaction failed or not found" };
      }

      // Verify it's a USDC transfer to the correct recipient
      const isValidTransfer =
        receipt.to?.toLowerCase() === X402_CONFIG.assetAddress.toLowerCase();

      if (isValidTransfer) {
        // Cache the verification
        verifiedPayments.set(payload.txHash, {
          timestamp: Date.now(),
          amount: payload.amount,
          from: payload.from,
        });

        return { isValid: true, txHash: payload.txHash };
      }

      return { isValid: false, reason: "Invalid transfer details" };
    }

    return { isValid: false, reason: "No valid payment proof provided" };
  } catch (error) {
    console.error("Payment verification error:", error);
    return {
      isValid: false,
      reason: "Verification error: " + (error as Error).message,
    };
  }
}

export async function GET(req: NextRequest) {
  // Check for payment header
  const paymentHeader = req.headers.get("x-payment");

  if (!paymentHeader) {
    // No payment provided, return 402 with payment requirements
    return NextResponse.json(generatePaymentChallenge(), { status: 402 });
  }

  // Verify the payment
  const verification = await verifyPayment(paymentHeader);

  if (!verification.isValid) {
    // Invalid payment, return 402 with error
    const challenge = generatePaymentChallenge();
    (challenge as any).error =
      verification.reason || "Payment verification failed";
    return NextResponse.json(challenge, { status: 402 });
  }
  console.log("Now Verify", verification);
  // Payment verified, return weather data -> Mock Test Data
  const weatherData = {
    location: "Sei Network",
    temperature: "99°F",
    conditions: "Sunny",
    humidity: "45%",
    windSpeed: "8 mph",
    timestamp: new Date().toISOString(),
    payment: verification,
  };

  return NextResponse.json(weatherData);
}
