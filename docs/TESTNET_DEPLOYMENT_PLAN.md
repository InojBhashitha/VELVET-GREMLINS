# Velvet Gremlins — Testnet Deployment Plan

> Phase 2 — Step-by-step guide for TON testnet deployment
> Last updated: 2026-09-06

---

## Prerequisites

### Tools & Environment

| Tool | Purpose | Install |
|---|---|---|
| **Node.js ≥ 18** | Runtime for Blueprint | Already installed |
| **Blueprint SDK** | TON development framework | Already in project |
| **TON Sandbox** | Local contract testing | Already in devDependencies |
| **Tonkeeper / MyTonWallet** | Wallet for testnet interaction | Install on phone/browser |

### Accounts & Services

| Requirement | How to Obtain |
|---|---|
| **Testnet wallet** | Create a new wallet in Tonkeeper/MyTonWallet and switch to testnet mode |
| **Test TON** | Request from `@testgiver_ton_bot` on Telegram |
| **IPFS pinning (test)** | Pinata free tier or nft.storage for test metadata hosting |

---

## Step 1: Implement Smart Contracts

### 1.1 Collection Contract

Create a TEP-62 + TEP-66 compliant collection contract that:

- Stores collection metadata URI
- Deploys NFT item contracts on mint
- Implements `royalty_params()` returning 5% (50/1000) + destination
- Restricts minting to the owner (admin) address
- Provides all required get-methods

### 1.2 Item Contract

Create a TEP-62 compliant NFT item contract that:

- Stores owner, collection address, item index, and individual content
- Supports standard NFT transfer operations
- Provides `get_nft_data()` get-method

### 1.3 Contract Files

```
VELVET-GREMLINS/contracts/
├── nft_collection.tolk     # Collection contract
├── nft_item.tolk           # Item contract
├── storage.tolk            # Storage structs & helpers
├── messages.tolk           # Message structs & opcodes
├── errors.tolk             # Error codes
└── fees-management.tolk    # Fee constants

VELVET-GREMLINS/wrappers/
├── NftCollection.ts        # Collection wrapper
├── NftItem.ts              # Item wrapper
├── NftCollection.compile.ts
└── NftItem.compile.ts
```

---

## Step 2: Write Tests

### 2.1 Test Coverage

```
VELVET-GREMLINS/tests/
├── NftCollection.spec.ts
└── NftItem.spec.ts
```

| Test | Description |
|---|---|
| Collection deployment | Deploys successfully with correct initial data |
| Mint item #0 | Collection mints a single NFT item at index 0 |
| Mint restriction | Only owner can mint; rejects unauthorized attempts |
| Collection data | `get_collection_data()` returns correct values |
| NFT address by index | `get_nft_address_by_index(0)` returns correct address |
| NFT content | `get_nft_content(0, ...)` returns correct metadata |
| Royalty params | `royalty_params()` returns (50, 1000, destination) |
| Item data | `get_nft_data()` returns correct owner, index, collection |
| Transfer | Owner can transfer the NFT item |
| Transfer rejection | Non-owner cannot transfer |
| Max supply | Collection does not allow minting beyond expected supply |

### 2.2 Run Tests

```bash
cd VELVET-GREMLINS
npx blueprint test
```

---

## Step 3: Upload Test Metadata

### 3.1 Prepare Files for Upload

```
Upload to IPFS (test):
├── collection.json              # From collection/metadata/collection.json
├── velvet-gremlin-000-founder.json  # From collection/metadata/
└── velvet-gremlin-000-founder.jpg   # From collection/artwork/
```

### 3.2 Update Metadata URIs

After uploading, replace the `<PLACEHOLDER>` values in the JSON files with actual IPFS URIs:

```json
{
  "image": "ipfs://QmXXXXXXXXXXX/velvet-gremlin-000-founder.jpg"
}
```

### 3.3 Re-upload Final Metadata

Upload the updated JSON files (with real image URIs) back to IPFS. The collection contract will point to the final JSON URI.

---

## Step 4: Deploy to Testnet

### 4.1 Configure Wallet

```bash
# Set your testnet wallet mnemonic as environment variable
export WALLET_MNEMONIC="word1 word2 word3 ... word24"

# Or use .env file (ensure it's in .gitignore!)
```

### 4.2 Create Deployment Script

```
VELVET-GREMLINS/scripts/
├── deployCollection.ts          # Deploys the collection contract
└── mintFounder.ts               # Mints item #0 (Founder)
```

### 4.3 Deploy Collection

```bash
cd VELVET-GREMLINS
npx blueprint run deployCollection --testnet
```

Expected output:
- Collection contract deployed to testnet
- Collection address printed to console
- Transaction confirmed on testnet explorer

### 4.4 Mint Founder (#000)

```bash
npx blueprint run mintFounder --testnet
```

Expected output:
- NFT Item contract deployed at index 0
- Item address printed to console
- Owner set to deployer wallet

---

## Step 5: Verify

### 5.1 On-Chain Verification

| Check | How |
|---|---|
| Collection exists | View collection address on [testnet.tonviewer.com](https://testnet.tonviewer.com) |
| Item exists | View item address on testnet explorer |
| Metadata resolves | Call `get_nft_content(0, ...)` and verify URI |
| Royalty correct | Call `royalty_params()` and verify 50/1000 |
| Owner correct | Call `get_nft_data()` and verify owner address |

### 5.2 Getgems Testnet

- Navigate to the Getgems testnet environment
- Search for the collection address
- Verify the NFT displays with correct:
  - Name: "Velvet Gremlin #000 — Founder"
  - Image: Founder artwork
  - Attributes: All 15 traits
  - Description: Full description text

### 5.3 Transfer Test

- Transfer the testnet Founder NFT to a second wallet
- Verify ownership change on explorer
- Transfer it back

---

## Step 6: Pre-Mainnet Review

Before proceeding to mainnet:

- [ ] All tests pass
- [ ] Testnet deployment successful
- [ ] Metadata displays correctly on Getgems testnet
- [ ] Royalties verified
- [ ] Transfer works
- [ ] Final artwork uploaded to permanent IPFS (pinned)
- [ ] Creator name confirmed
- [ ] Owner wallet confirmed (mainnet)
- [ ] Contract code reviewed

---

## Cost Estimates (Testnet)

All testnet operations are free (test TON from faucet bot).

### Mainnet Estimates (for reference)

| Operation | Estimated Cost |
|---|---|
| Deploy collection contract | ~0.05-0.1 TON |
| Mint 1 NFT item | ~0.05-0.1 TON |
| Total for Founder (1/1) | ~0.1-0.2 TON |

*Costs are approximate and depend on network conditions.*

---

## Rollback Plan

If issues are discovered during testnet:

1. Fix the contract code
2. Re-run tests
3. Deploy a new collection contract (testnet contracts are disposable)
4. Re-mint the test item
5. Repeat verification

No cleanup needed — testnet contracts don't affect mainnet.
