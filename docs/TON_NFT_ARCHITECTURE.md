# Velvet Gremlins — TON NFT Architecture Plan

> Phase 2 Preparation Document
> Last updated: 2026-09-06

---

## 1. Overview

The Velvet Gremlins NFT project targets the **TON (The Open Network)** blockchain. The architecture follows the standard TON NFT contract pattern defined by **TEP-62** (NFT Standard), **TEP-64** (Token Data Standard), and **TEP-66** (NFT Royalty Standard).

On TON, every NFT collection and every individual NFT item is a **separate smart contract**. This is fundamentally different from Ethereum/Solana where a single contract holds all tokens.

### Standards Implemented

| Standard | Purpose | Status |
|---|---|---|
| **TEP-62** | NFT collection + item contract interface | Required |
| **TEP-64** | Metadata format (off-chain JSON) | Required |
| **TEP-66** | Royalty parameters for marketplaces | Required |

---

## 2. Contract Architecture

```
┌─────────────────────────────────────┐
│       NFT Collection Contract       │
│         "Velvet Gremlins"           │
│                                     │
│  • Collection metadata URI          │
│  • Owner address (deployer)         │
│  • Next item index                  │
│  • Royalty params (5%, destination) │
│  • Mint logic                       │
│  • get_collection_data()            │
│  • get_nft_address_by_index()       │
│  • get_nft_content()                │
│  • royalty_params()                 │
└──────────────┬──────────────────────┘
               │ deploys
               ▼
┌─────────────────────────────────────┐
│        NFT Item Contract            │
│   "Velvet Gremlin #000 — Founder"   │
│         (index: 0)                  │
│                                     │
│  • Owner address                    │
│  • Collection address               │
│  • Item index (0)                   │
│  • Individual content (metadata)    │
│  • Transfer logic                   │
│  • get_nft_data()                   │
└─────────────────────────────────────┘
```

### 2.1 Collection Contract

The collection contract is the root of the Velvet Gremlins project on-chain. It:

- Stores the collection-level metadata URI (pointing to `collection.json` on IPFS)
- Manages the minting of new NFT items
- Tracks the `next_item_index` (starts at 0)
- Implements TEP-66 royalty parameters (5% / destination address)
- Provides get-methods for wallets and marketplaces to query collection data

**Key Get-Methods (TEP-62):**

| Method | Returns |
|---|---|
| `get_collection_data()` | `(next_item_index, collection_content, owner_address)` |
| `get_nft_address_by_index(index)` | Address of the NFT item contract at that index |
| `get_nft_content(index, individual_content)` | Full metadata for a specific NFT |

**Royalty Get-Method (TEP-66):**

| Method | Returns |
|---|---|
| `royalty_params()` | `(numerator, denominator, destination)` |

For 5% royalty: `numerator = 50`, `denominator = 1000`, `destination = royalty_recipient_address`

### 2.2 NFT Item Contract

Each Velvet Gremlin is an individual smart contract deployed by the collection contract during minting. For the Founder:

- **Index:** 0
- **Owner:** The wallet address that mints it
- **Collection:** Address of the Velvet Gremlins collection contract
- **Content:** Individual metadata (URI pointing to the item's JSON on IPFS)

**Key Get-Methods (TEP-62):**

| Method | Returns |
|---|---|
| `get_nft_data()` | `(init?, index, collection_address, owner_address, individual_content)` |

**Transfer Support:**

The Founder is a standard transferable NFT (TEP-62), not an SBT. It can be sold on Getgems and other TON NFT marketplaces.

---

## 3. Metadata Architecture (TEP-64)

We use the **off-chain** metadata approach: contracts store URIs pointing to JSON files hosted on decentralized storage (IPFS).

### 3.1 Storage Layout

```
IPFS (or Arweave)
├── collection.json            ← Collection contract points here
├── velvet-gremlin-000-founder.json   ← Item 0 individual content
└── artwork/
    └── velvet-gremlin-000-founder.png  ← Image file
```

### 3.2 How Metadata Resolution Works on TON

1. **Collection-level:** The collection contract stores a `collection_content` cell containing the base URI (e.g., `ipfs://Qm.../`)
2. **Item-level:** Each NFT item stores an `individual_content` cell with item-specific data (e.g., `velvet-gremlin-000-founder.json`)
3. **Resolution:** `get_nft_content(index, individual_content)` concatenates the collection base URI with the individual content to produce the full metadata URI
4. **Marketplace reads:** Getgems/wallets fetch the JSON from the resolved URI and display name, description, image, and attributes

### 3.3 Collection Metadata Schema

```json
{
  "name": "Velvet Gremlins",
  "description": "Premium digital collectibles...",
  "image": "ipfs://Qm.../collection-cover.png",
  "cover_image": "ipfs://Qm.../collection-banner.png",
  "social_links": ["https://t.me/...", "https://twitter.com/..."],
  "marketplace": "getgems.io",
  "creator": "<PLACEHOLDER>"
}
```

### 3.4 Item Metadata Schema

```json
{
  "name": "Velvet Gremlin #000 — Founder",
  "description": "The genesis character...",
  "image": "ipfs://Qm.../velvet-gremlin-000-founder.png",
  "content_url": "ipfs://Qm.../velvet-gremlin-000-founder-hires.png",
  "marketplace": "getgems.io",
  "attributes": [
    { "trait_type": "Number", "value": "#000" },
    { "trait_type": "Role", "value": "Founder" },
    ...
  ]
}
```

**Image Requirements (Getgems-compatible):**

| Property | Requirement |
|---|---|
| **Format** | PNG preferred (supports transparency), JPEG/WEBP acceptable |
| **Dimensions** | Recommended 1000×1000 px minimum |
| **Max file size** | Under 30 MB |
| **Aspect ratio** | 1:1 (square) preferred for consistent display |

---

## 4. Royalty Implementation Plan

### 4.1 Configuration

| Parameter | Value | Encoding |
|---|---|---|
| **Royalty percentage** | 5% | numerator=50, denominator=1000 |
| **Royalty destination** | Owner wallet address | Set at deployment |

### 4.2 How Royalties Work on TON

- Royalties on TON are **advisory** — they are defined via TEP-66 and read by cooperating marketplaces
- When a sale occurs on a TEP-66-aware marketplace (like Getgems), the marketplace:
  1. Calls `royalty_params()` on the collection contract
  2. Calculates the royalty amount from the sale price
  3. Sends the royalty payment to the `destination` address
  4. Sends the remainder to the seller
- Royalties are **not enforced at the contract level** — they depend on marketplace cooperation
- Getgems, the primary TON NFT marketplace, **does honor TEP-66 royalties**

### 4.3 Implementation in Contract

The collection contract must:

1. **Store** `royalty_factor` (numerator), `royalty_base` (denominator), and `royalty_destination` (address) in its persistent data
2. **Expose** the `royalty_params()` get-method
3. **Handle** `get_royalty_params` internal messages and reply with `report_royalty_params`

---

## 5. Founder Asset Requirements

### 5.1 Current State

| Asset | Format | Dimensions | Status |
|---|---|---|---|
| Master artwork | JPEG | 1024×1024 | ✅ Preserved |
| Transparent PNG | — | — | ⏳ Not yet available |
| High-resolution version | — | — | ⏳ Not yet available |

### 5.2 Recommended Final Asset Specifications

| Property | Ideal | Minimum Acceptable |
|---|---|---|
| **Format** | PNG (with transparency) | JPEG (current) |
| **Dimensions** | 2048×2048 or higher | 1024×1024 (current) |
| **Color depth** | 32-bit RGBA | 24-bit RGB |
| **Background** | Transparent (alpha channel) | White (current) |
| **File size** | Under 30 MB | Under 30 MB (current: 370 KB ✅) |

### 5.3 Asset Pipeline

The project is structured to accommodate artwork upgrades without breaking anything:

```
assets/founder/original/
  └── velvet-gremlin-000-founder-original.jpg   ← Current master (JPEG, locked)

assets/founder/original/
  └── velvet-gremlin-000-founder-original.png   ← Future: high-res PNG master

assets/founder/clean/
  └── velvet-gremlin-000-founder-clean.png      ← Future: production PNG

collection/artwork/
  └── velvet-gremlin-000-founder.png            ← Future: mint-ready PNG
```

When a transparent PNG becomes available:
1. Place the new master in `assets/founder/original/` (keep the JPEG as historical reference)
2. Create a production copy in `assets/founder/clean/`
3. Update `collection/artwork/` with the mint-ready version
4. Upload to IPFS/Arweave
5. Update the `image` field in the item metadata JSON with the real URI

---

## 6. Testnet Deployment Plan

### 6.1 Prerequisites

Before testnet deployment, the following must be ready:

| Item | Status |
|---|---|
| Collection metadata JSON (collection.json) | ✅ Created |
| Item metadata JSON (velvet-gremlin-000-founder.json) | ✅ Created |
| Artwork uploaded to IPFS (or test URL) | ⏳ Pending |
| Collection contract code (TEP-62 + TEP-66) | ⏳ To implement |
| NFT Item contract code (TEP-62) | ⏳ To implement |
| Wrapper classes for TypeScript interaction | ⏳ To implement |
| Unit tests (Sandbox) | ⏳ To implement |
| Deployment script (testnet) | ⏳ To implement |
| TON testnet wallet with test TON | ⏳ To set up |

### 6.2 Testnet Deployment Steps

1. **Develop contracts** — Implement collection + item contracts in FunC or Tact
2. **Write wrappers** — TypeScript wrappers for Blueprint interaction
3. **Write tests** — Sandbox tests covering:
   - Collection deployment
   - Single item mint (index 0)
   - Metadata retrieval via `get_nft_content()`
   - Royalty params verification
   - Transfer functionality
   - Owner permissions
4. **Upload test metadata** — Use a temporary HTTP URL or testnet IPFS for metadata
5. **Deploy to testnet** — Run `npx blueprint run` with testnet configuration
6. **Verify on explorer** — Check collection and item on testnet explorer
7. **Test on Getgems testnet** — Verify metadata displays correctly

### 6.3 Testnet Configuration

```bash
# Deploy to testnet (Blueprint supports this via network selection)
npx blueprint run deployCollection --testnet

# The deployment script will prompt for wallet mnemonic
# Use a testnet wallet funded via https://t.me/testgiver_ton_bot
```

### 6.4 Contract Language Decision

The existing Blueprint scaffold uses **Tolk** (`.tolk` files). However, for the NFT contracts, we have three options:

| Language | Pros | Cons |
|---|---|---|
| **FunC** | Most reference implementations available, battle-tested | Older, lower-level syntax |
| **Tact** | Higher-level, better DX, good NFT templates | Newer, fewer examples for edge cases |
| **Tolk** | Already in scaffold, modern FunC successor | Fewer NFT reference implementations |

**Recommendation:** Use **Tact** for the NFT contracts — it has the best developer experience, first-class NFT support, and solid reference implementations. The existing Tolk scaffold can be replaced or kept alongside.

---

## 7. Information Required Before Minting

The following must be known/decided before the Founder NFT can be minted on mainnet:

### 7.1 Must-Have (Blocking)

| Item | Description | Status |
|---|---|---|
| **Owner wallet address** | The TON wallet that will deploy the collection and receive the minted Founder NFT | ❓ Not yet provided |
| **Royalty destination address** | The TON wallet that receives 5% royalties from secondary sales | ❓ Not yet provided (may be same as owner) |
| **Creator name** | Name/alias to display as creator in metadata | ❓ Placeholder — awaiting input |
| **Final artwork file** | The definitive artwork to be permanently stored on-chain (ideally PNG with transparency) | ⏳ Current JPEG approved as visual source; PNG upgrade path prepared |
| **Decentralized storage** | Artwork and metadata must be uploaded to IPFS or Arweave and pinned permanently | ⏳ Not yet set up |
| **IPFS pinning service** | A reliable pinning service (Pinata, Infura, nft.storage, etc.) to ensure permanence | ❓ Not yet chosen |

### 7.2 Should-Have (Recommended)

| Item | Description | Status |
|---|---|---|
| **Social links** | Telegram channel/group, Twitter/X, website URLs for collection metadata | ❓ Not yet provided |
| **Collection cover image** | A banner/cover image for the collection page on Getgems | ⏳ Not yet created |
| **Testnet verification** | Successful testnet deployment and Getgems testnet listing | ⏳ Pending |
| **Contract audit** | Security review of the smart contracts before mainnet deployment | ⏳ Pending |

### 7.3 Nice-to-Have (Optional)

| Item | Description | Status |
|---|---|---|
| **Custom domain** | A domain for web presence / metadata hosting fallback | ❓ Not decided |
| **Telegram Bot / Mini App** | Telegram integration for minting or showcase | ❓ Future consideration |

---

## 8. Project File Map

### Existing Files (Phase 1 — Unchanged)

| File | Purpose |
|---|---|
| `assets/founder/original/velvet-gremlin-000-founder-original.jpg` | Original master artwork |
| `assets/founder/clean/velvet-gremlin-000-founder-clean.jpg` | Production copy |
| `assets/founder/references/velvet-gremlin-000-founder-reference.jpg` | Artist reference |
| `docs/STYLE_GUIDE.md` | Visual style guide |
| `README.md` | Project overview |

### Updated Files (Phase 2 Preparation)

| File | What Changed |
|---|---|
| `collection/metadata/velvet-gremlin-000-founder.json` | Updated to TEP-64 schema; added `content_url`, `marketplace`; `image` is now a documented placeholder |
| `docs/FOUNDER_SPEC.md` | Updated with confirmed blockchain (TON), royalty (5%), and Phase 2 status |

### New Files (Phase 2 Preparation)

| File | Purpose |
|---|---|
| `collection/metadata/collection.json` | TEP-64 collection-level metadata |
| `docs/TON_NFT_ARCHITECTURE.md` | This document — full architecture plan |
| `docs/TESTNET_DEPLOYMENT_PLAN.md` | Step-by-step testnet deployment guide |
| `docs/PRE_MINT_CHECKLIST.md` | Checklist of everything needed before mainnet mint |

---

## 9. Recommended Next Steps

1. **Decide on contract language** (Tact recommended)
2. **Implement collection + item contracts** with TEP-62 + TEP-66
3. **Write comprehensive Sandbox tests**
4. **Set up testnet wallet** and fund with test TON
5. **Upload test metadata** to a temporary location
6. **Deploy to testnet** and verify
7. **Provide creator name** and social links
8. **Prepare final artwork** (transparent PNG if available)
9. **Choose IPFS pinning service**
10. **Mainnet deployment** (only after all verification passes)
