# AxiomKit Demo X402 (SEI) — Installation & X402 Guide

This project demonstrates an end-to-end X402 (HTTP 402 Payment Required) micropayment flow on the SEI testnet using AxiomKit. It includes:

- A Next.js API route `app/api/weather/route.ts` that enforces an X402 payment to access weather data
- An Axiom agent configured in `lib/axiom-config.ts` that performs the X402 payment and retries the request with proof

Use this README to install, configure, run, and test the X402 payment flow locally.

## Prerequisites

- Node.js 18+ and PNPM installed
- SEI testnet EVM wallet private key (funded with a small amount of SEI for gas)
- USDC on SEI testnet (for the $0.001 payment)

Helpful links:
- SEI testnet RPC is preconfigured in this repo
- USDC testnet address used here: `0x4fCF1784B31630811181f670Aea7A7bEF803eaED`

## 1) Clone and Install

```bash
git clone https://github.com/your-org/axiomkit-demo-x402.git
cd axiomkit-demo-x402
pnpm install
```

## 2) Environment Variables

Create a `.env.local` file in the project root with the following keys (values are examples; replace with yours):

```bash
# Required for SEI wallet
SEI_PRIVATE_KEY=0xYOUR_TESTNET_PRIVATE_KEY
SEI_RPC_URL=https://evm-rpc-testnet.sei-apis.com

# Required by the app's LLM provider wiring
GROQ_API_KEY=your_groq_api_key
```

- `SEI_PRIVATE_KEY`: An EVM-compatible SEI testnet private key holding SEI for gas and some USDC if you intend to pay via the agent.
- `SEI_RPC_URL`: Already set to the official SEI EVM testnet RPC.
- `GROQ_API_KEY`: Present to satisfy validation; not used for X402 itself.

## 3) X402 Configuration (already set)

X402 testnet parameters are defined in `lib/axiom-config.ts` via `X402_CONFIG`:

- **network**: `sei-testnet`
- **chainId**: `1328`
- **asset**: `USDC`
- **assetAddress**: `0x4fCF1784B31630811181f670Aea7A7bEF803eaED`
- **assetDecimals**: `6`
- **recipient**: `0x9dC2aA0038830c052253161B1EE49B9dD449bD66` (example)
- **rpcUrl**: `https://evm-rpc-testnet.sei-apis.com`

Adjust `recipient` if you want payments to settle to a different account.

## 4) Start the App

```bash
pnpm dev
# App runs on http://localhost:3000
```

## 5) How X402 Works in This Repo

- Client requests `GET /api/weather`
- Server returns `402 Payment Required` with a JSON payment challenge describing how to pay (USDC on SEI testnet, recipient, amount, etc.)
- Client performs the on-chain payment
- Client retries `GET /api/weather` including an `X-Payment` header (base64-encoded JSON proof)
- Server verifies the payment on-chain and, if valid, returns the weather data

Key files:
- `app/api/weather/route.ts`: Generates the challenge and verifies payment (`verifyPayment`)
- `lib/axiom-config.ts`: Holds `X402_CONFIG` and the agent actions including `getWeather`

## 6) Manual X402 Test via cURL

Step A — Request the weather without payment (expect 402):

```bash
curl -i http://localhost:3000/api/weather
```

You should see `HTTP/1.1 402 Payment Required` and a JSON body containing fields like `x402Version`, `accepts`, `payTo`, `asset`, and `extra.reference`.

Step B — Make a USDC transfer on SEI testnet to the `payTo` address for the requested amount. You can do this with your preferred wallet tooling. Note the resulting `txHash`.

Step C — Build the payment proof header and retry. The header is a base64-encoded JSON object:

```json
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "sei-testnet",
  "payload": {
    "txHash": "0x...",
    "amount": "1000",     
    "from": "0xYourWallet"
  }
}
```

Notes:
- `amount` is in smallest units (USDC has 6 decimals). For `$0.001 USDC` that equals `1000`.
- `txHash` must be a confirmed transfer to the configured USDC contract (`assetAddress`).

Encode the JSON to base64 and pass as `X-Payment` header:

```bash
PAYMENT=$(cat <<'JSON' | base64
{
  "x402Version": 1,
  "scheme": "exact",
  "network": "sei-testnet",
  "payload": {
    "txHash": "0xYOUR_TX_HASH",
    "amount": "1000",
    "from": "0xYOUR_FROM_ADDRESS"
  }
}
JSON
)

curl -s \
  -H "Content-Type: application/json" \
  -H "X-Payment: $PAYMENT" \
  http://localhost:3000/api/weather | jq
```

If verification succeeds, you’ll receive weather JSON with a `payment` field echoing verification details.

## 7) Using the Axiom Agent to Perform X402 Automatically

The `getWeather` action in `lib/axiom-config.ts` automates the entire flow:

1. Requests `/api/weather` → receives `402` + challenge
2. Performs a USDC transfer using the configured SEI wallet
3. Waits briefly for confirmation
4. Retries `/api/weather` with a properly formed `X-Payment` header

To use this, ensure your `.env.local` fields are set and the wallet has USDC and gas. Triggering the action depends on your app’s UI or agent integration; in this demo it is wired through the Axiom context and actions.

## 8) Troubleshooting

- 402 keeps returning even after payment:
  - Ensure `txHash` corresponds to a USDC transfer to the correct `assetAddress`
  - Confirm `amount` matches the required units (USDC 6 decimals)
  - Check your `network` is `sei-testnet`
  - Give the network a few seconds to finalize

- Invalid payment format or network:
  - Verify your base64-encoded JSON structure matches the example
  - Headers are case-insensitive, but this repo reads `X-Payment`

- Rate limits or RPC errors:
  - Wait and retry; ensure `SEI_RPC_URL` is reachable

## 9) Configuration Reference

- `lib/axiom-config.ts` → `X402_CONFIG` (network, asset, recipient, decimals)
- `app/api/weather/route.ts` → challenge structure, `verifyPayment` logic
- Wallet class: `AxiomSeiWallet` from `@axiomkit/sei`

## 10) Security Notes

- Do not commit real private keys
- In production, store payment verifications in a database (not an in-memory `Map`)
- Validate `reference` and consider replay protection strategies
- Serve over HTTPS in production

---

If you intended “map” installation guidance, please clarify the mapping provider and desired integration so we can extend this README with map-specific steps. For now, this guide focuses on installing the app and running the detailed X402 flow.

## Read more about 402 and mapping to X402 on SEI

- **HTTP 402 Payment Required**: Defined in HTTP Semantics (RFC 9110). While reserved, it's used by modern payment flows like X402 to indicate that a resource requires payment prior to access.
- **Deep dive (this repo)**: See `X402_Axiom_SEI_Documentation.md` for an extended overview, architecture, and examples tailored to this codebase.

### Mapping: 402 challenge ↔ X402/Axiom/SEI implementation

- `accepts[0].network` ↔ `X402_CONFIG.network` in `lib/axiom-config.ts`
- `accepts[0].asset` ↔ `X402_CONFIG.assetAddress` (USDC contract on SEI testnet)
- `accepts[0].extra.name` ↔ `X402_CONFIG.asset` (token symbol)
- `accepts[0].payTo` ↔ `X402_CONFIG.recipient` (recipient address)
- `accepts[0].maxAmountRequired` (in smallest units) ↔ `X402_CONFIG.assetDecimals`
- `resource` ↔ protected endpoint path (`/api/weather`)
- `extra.reference` ↔ unique per-request reference from `app/api/weather/route.ts`

### Mapping: verification path

- `X-Payment` header (base64 JSON) → parsed/validated in `verifyPayment()` within `app/api/weather/route.ts`
- `payload.txHash` → checked via viem `publicClient.getTransactionReceipt()` using `X402_CONFIG.rpcUrl` and `chainId`
- Receipt success + destination equals `X402_CONFIG.assetAddress` → payment accepted → data returned

### Mapping: client/agent responsibilities

- Axiom agent action `getWeather` (in `lib/axiom-config.ts`):
  - Fetches `/api/weather` to receive the 402 challenge
  - Performs USDC transfer using `AxiomSeiWallet`
  - Constructs `X-Payment` proof and retries the request
  - Updates agent memory with transaction details and results

For a full narrative and future enhancements, read `X402_Axiom_SEI_Documentation.md`.
