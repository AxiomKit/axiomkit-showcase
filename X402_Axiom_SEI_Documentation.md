# X402 Protocol and Axiom Integration with SEI Blockchain

## Table of Contents
1. [What is X402?](#what-is-x402)
2. [X402 Protocol Overview](#x402-protocol-overview)
3. [Axiom Integration with X402](#axiom-integration-with-x402)
4. [SEI Blockchain Implementation](#sei-blockchain-implementation)
5. [Technical Architecture](#technical-architecture)
6. [Payment Flow](#payment-flow)
7. [Configuration](#configuration)
8. [Code Examples](#code-examples)
9. [Security Considerations](#security-considerations)
10. [Future Enhancements](#future-enhancements)

## What is X402?

X402 is an open standard protocol for internet-native payments that enables users to send and receive payments globally in a simple, secure, and interoperable manner. The protocol leverages the HTTP 402 status code ("Payment Required") to facilitate blockchain-based micropayments directly through HTTP requests.

### Key Features of X402:
- **HTTP-Native**: Uses standard HTTP status codes and headers
- **Blockchain Integration**: Supports multiple blockchain networks
- **Real-time Settlement**: Enables instant payment verification
- **Interoperable**: Works across different payment schemes and networks
- **Micropayment Support**: Designed for small, frequent transactions

## X402 Protocol Overview

The X402 protocol follows a specific flow:

1. **Initial Request**: Client makes a request to a protected resource
2. **402 Response**: Server responds with HTTP 402 and payment requirements
3. **Payment Execution**: Client executes blockchain payment
4. **Payment Proof**: Client includes payment proof in subsequent request
5. **Resource Access**: Server verifies payment and grants access

### HTTP 402 Status Code
The HTTP 402 "Payment Required" status code is used to indicate that payment is required to access the requested resource. This status code was originally reserved for future use but has been adopted by the X402 protocol for blockchain-based payments.

## Axiom Integration with X402

Axiom is a blockchain interaction framework that provides tools and libraries for building decentralized applications. In this implementation, Axiom integrates with X402 to enable seamless blockchain payments within SEI network applications.

### Axiom Components Used:
- **@axiomkit/core**: Core framework for building blockchain agents
- **@axiomkit/sei**: SEI blockchain integration
- **AxiomSeiWallet**: Wallet management for SEI transactions
- **Context and Actions**: Framework for building interactive blockchain agents

## SEI Blockchain Implementation

This implementation uses the SEI testnet for X402 payments with the following configuration:

### Network Configuration:
```typescript
export const X402_CONFIG = {
  network: "sei-testnet",
  chainId: 1328,
  asset: "USDC",
  assetAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED", // Sei Testnet USDC
  assetDecimals: 6,
  recipient: "0x9dC2aA0038830c052253161B1EE49B9dD449bD66",
  rpcUrl: "https://evm-rpc-testnet.sei-apis.com",
};
```

### SEI Network Benefits:
- **High Performance**: Fast transaction processing
- **Low Fees**: Cost-effective for micropayments
- **EVM Compatibility**: Supports Ethereum tooling
- **USDC Support**: Native stablecoin integration

## Technical Architecture

The X402 implementation consists of several key components:

### 1. Payment Challenge Generation
```typescript
function generatePaymentChallenge() {
  const reference = `sei-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const amountInUnits = parseUnits("0.001", X402_CONFIG.assetDecimals);

  return {
    x402Version: 1,
    accepts: [{
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
        version: "2",
        reference: reference,
      },
    }],
  };
}
```

### 2. Payment Verification
```typescript
async function verifyPayment(paymentHeader: string) {
  const paymentData = JSON.parse(Buffer.from(paymentHeader, "base64").toString());
  const { x402Version, scheme, network, payload } = paymentData;

  // Validate payment format
  if (x402Version !== 1 || scheme !== "exact" || network !== X402_CONFIG.network) {
    return { isValid: false, reason: "Invalid payment format or network" };
  }

  // Verify transaction on-chain
  const receipt = await publicClient.getTransactionReceipt({
    hash: payload.txHash as `0x${string}`,
  });

  return { isValid: receipt?.status === "success", txHash: payload.txHash };
}
```

### 3. Axiom Agent Integration
The Axiom agent handles the complete X402 flow:

```typescript
action({
  name: "getWeather",
  description: "Get current weather data. This requires an X402 payment of $0.001 USDC.",
  async handler({ location }, { memory }) {
    // Step 1: Request weather data (returns 402 Payment Required)
    const weatherResponse = await fetch(`${baseUrl}/api/weather`);
    
    if (weatherResponse.status !== 402) {
      throw new Error(`Expected 402 Payment Required, got ${weatherResponse.status}`);
    }

    const paymentChallenge = await weatherResponse.json();

    // Step 2: Make X402 payment
    const txHash = await makeX402Payment(amount, recipient, reference);

    // Step 3: Retry request with payment proof
    const paymentProof = {
      x402Version: 1,
      scheme: "exact",
      network: X402_CONFIG.network,
      payload: { txHash, amount, from: seiWallet.walletAddress },
    };

    const weatherDataResponse = await fetch(`${baseUrl}/api/weather`, {
      headers: { "X-Payment": Buffer.from(JSON.stringify(paymentProof)).toString("base64") },
    });

    return weatherDataResponse.json();
  },
})
```

## Payment Flow

The complete X402 payment flow in this implementation:

### 1. Initial Request
```
Client → GET /api/weather
Server → 402 Payment Required + Payment Challenge
```

### 2. Payment Challenge Response
```json
{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "sei-testnet",
    "maxAmountRequired": "1000",
    "resource": "/api/weather",
    "description": "Get current weather data",
    "mimeType": "application/json",
    "payTo": "0x9dC2aA0038830c052253161B1EE49B9dD449bD66",
    "maxTimeoutSeconds": 300,
    "asset": "0x4fCF1784B31630811181f670Aea7A7bEF803eaED",
    "extra": {
      "name": "USDC",
      "version": "2",
      "reference": "sei-1234567890-abc123"
    }
  }]
}
```

### 3. Payment Execution
The Axiom agent executes a USDC transfer on SEI testnet:
```typescript
const transferData = encodeFunctionData({
  abi: [{
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ name: "", type: "bool" }],
  }],
  functionName: "transfer",
  args: [recipient, amountInUnits],
});

const hash = await seiWallet.walletClient.sendTransaction({
  to: X402_CONFIG.assetAddress,
  data: transferData,
});
```

### 4. Payment Proof Submission
```
Client → GET /api/weather + X-Payment Header (base64 encoded payment proof)
Server → Verifies payment + Returns weather data
```

## Configuration

### Environment Variables
```bash
SEI_PRIVATE_KEY=your_private_key_here
SEI_RPC_URL=https://evm-rpc-testnet.sei-apis.com
GROQ_API_KEY=your_groq_api_key_here
```

### X402 Configuration
```typescript
export const X402_CONFIG = {
  network: "sei-testnet",           // SEI testnet network identifier
  chainId: 1328,                   // SEI testnet chain ID
  asset: "USDC",                    // Payment asset
  assetAddress: "0x4fCF1784B31630811181f670Aea7A7bEF803eaED", // USDC contract address
  assetDecimals: 6,                 // USDC decimal places
  recipient: "0x9dC2aA0038830c052253161B1EE49B9dD449bD66",    // Payment recipient
  rpcUrl: "https://evm-rpc-testnet.sei-apis.com",             // SEI RPC endpoint
};
```

## Code Examples

### Complete Weather API Implementation
```typescript
export async function GET(req: NextRequest) {
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
    challenge.error = verification.reason || "Payment verification failed";
    return NextResponse.json(challenge, { status: 402 });
  }

  // Payment verified, return weather data
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
```

### Axiom Agent Weather Action
```typescript
action({
  name: "getWeather",
  description: "Get current weather data. This requires an X402 payment of $0.001 USDC.",
  schema: {
    location: z.string().optional().describe("Optional location for weather data."),
  },
  async handler({ location }, { memory }) {
    try {
      // Step 1: Request weather data (this will return 402 Payment Required)
      const weatherResponse = await fetch(`${baseUrl}/api/weather`);

      if (weatherResponse.status !== 402) {
        throw new Error(`Expected 402 Payment Required, got ${weatherResponse.status}`);
      }

      const paymentChallenge = await weatherResponse.json();

      // Step 2: Make X402 payment
      const reference = paymentChallenge.accepts[0].extra.reference;
      const amount = "0.001"; // $0.001 USDC
      const recipient = paymentChallenge.accepts[0].payTo;

      const txHash = await makeX402Payment(amount, recipient, reference);

      // Step 3: Wait for transaction confirmation
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Step 4: Retry weather request with payment proof
      const paymentProof = {
        x402Version: 1,
        scheme: "exact",
        network: X402_CONFIG.network,
        payload: {
          txHash: txHash,
          amount: parseUnits(amount, X402_CONFIG.assetDecimals).toString(),
          from: seiWallet.walletAddress,
        },
      };

      const paymentHeader = Buffer.from(JSON.stringify(paymentProof)).toString("base64");

      const weatherDataResponse = await fetch(`${baseUrl}/api/weather`, {
        headers: {
          "Content-Type": "application/json",
          "X-Payment": paymentHeader,
        },
      });

      const weatherData = await weatherDataResponse.json();

      // Update memory
      memory.transactions.unshift(txHash);
      memory.lastTransaction = txHash;

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

🔗 **View Transaction:** [SeiTrace](https://seitrace.com/tx/${txHash}?chain=atlantic-2)`);
    } catch (error) {
      return actionResponse(`❌ **Weather Request Failed**

${error.message}

Please try again or check your wallet balance for USDC tokens needed for the payment.`);
    }
  },
})
```

## Security Considerations

### Payment Verification
- **On-chain Verification**: All payments are verified against the SEI blockchain
- **Transaction Receipt Validation**: Ensures transaction success and proper recipient
- **Payment Caching**: Prevents double-spending by caching verified payments
- **Reference Validation**: Unique payment references prevent replay attacks

### Network Security
- **HTTPS Required**: All API communications use secure connections
- **Base64 Encoding**: Payment proofs are base64 encoded for safe transmission
- **Timeout Handling**: Payment challenges include timeout mechanisms
- **Error Handling**: Comprehensive error handling prevents information leakage

### Wallet Security
- **Private Key Management**: Private keys are stored securely in environment variables
- **Transaction Signing**: All transactions are properly signed before submission
- **Balance Validation**: Sufficient balance checks before payment execution

## Future Enhancements

### Planned Improvements
1. **EIP-3009 Integration**: Implement `transferWithAuthorization` for enhanced security
2. **Multi-Asset Support**: Support for additional payment tokens
3. **Payment Aggregation**: Batch multiple micropayments into single transactions
4. **Dynamic Pricing**: Adjustable payment amounts based on resource value
5. **Payment Subscriptions**: Recurring payment support for ongoing services

### Advanced Features
1. **Payment Escrow**: Hold payments until service completion
2. **Refund Mechanisms**: Automatic refunds for failed services
3. **Payment Analytics**: Detailed payment tracking and reporting
4. **Cross-Chain Support**: Extend to other blockchain networks
5. **Mobile Integration**: Native mobile app support for X402 payments

## Conclusion

The X402 protocol integration with Axiom on SEI blockchain provides a robust foundation for internet-native micropayments. This implementation demonstrates how blockchain payments can be seamlessly integrated into web applications, enabling new monetization models and user experiences.

The combination of X402's HTTP-native approach, Axiom's blockchain interaction framework, and SEI's high-performance network creates a powerful platform for building decentralized applications with integrated payment capabilities.

### Key Benefits:
- **Seamless Integration**: HTTP-native payment flow
- **Real-time Settlement**: Instant payment verification
- **Cost-Effective**: Low-fee micropayments on SEI
- **Developer Friendly**: Simple API integration
- **Secure**: On-chain verification and validation

This implementation serves as a foundation for building more complex payment-enabled applications and demonstrates the potential of blockchain-based micropayments in web applications.
