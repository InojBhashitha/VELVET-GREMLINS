# Velvet Gremlins — Pre-Mint Checklist

> Everything that must be ready before the Founder NFT can be minted on TON mainnet.
> Last updated: 2026-09-06

---

## 🔴 Critical (Must-Have — Blocks Minting)

### Artwork

- [ ] **Final artwork format decided** — PNG with transparency (preferred) or current JPEG
- [ ] **Final artwork file prepared** — Production copy in `collection/artwork/`
- [ ] **Artwork uploaded to IPFS/Arweave** — Permanent, pinned, decentralized
- [ ] **IPFS pinning service chosen** — Pinata / nft.storage / Infura / self-hosted
- [ ] **Image URI confirmed** — Real `ipfs://...` URI replaces placeholder in metadata

### Metadata

- [ ] **Item metadata finalized** — `velvet-gremlin-000-founder.json` with real image URI
- [ ] **Collection metadata finalized** — `collection.json` with real image URI and creator name
- [ ] **Metadata uploaded to IPFS** — Both JSON files pinned permanently
- [ ] **Metadata URIs confirmed** — Real URIs ready for contract deployment

### Identity

- [ ] **Creator/artist name confirmed** — Replaces `<PLACEHOLDER>` in collection metadata
- [ ] **Owner wallet address confirmed** — The TON wallet deploying the collection
- [ ] **Royalty destination address confirmed** — Where 5% royalties are sent (may be same as owner)

### Smart Contracts

- [ ] **Collection contract implemented** — TEP-62 + TEP-66 compliant
- [ ] **Item contract implemented** — TEP-62 compliant
- [ ] **All Sandbox tests pass** — Full coverage of mint, transfer, royalty, metadata
- [ ] **Testnet deployment successful** — Contracts verified on testnet explorer
- [ ] **Getgems testnet verification** — NFT displays correctly with all metadata

### Wallet

- [ ] **Mainnet wallet funded** — Sufficient TON for deployment (~0.2 TON minimum)
- [ ] **Wallet mnemonic secured** — Backed up safely, never committed to git

---

## 🟡 Recommended (Should-Have — Quality & Completeness)

### Branding

- [ ] **Collection cover/banner image** — For Getgems collection page
- [ ] **Social links prepared** — Telegram, Twitter/X, website URLs

### Security

- [ ] **Contract code reviewed** — At minimum, self-review against reference implementations
- [ ] **No hardcoded secrets** — Mnemonics, private keys in `.env` (gitignored)
- [ ] **.gitignore updated** — Excludes `.env`, mnemonics, and build artifacts

### Verification

- [ ] **Transfer tested on testnet** — NFT can be sent and received
- [ ] **Royalty verified on testnet** — `royalty_params()` returns correct values
- [ ] **Second testnet deployment** — Verify reproducibility

---

## 🟢 Optional (Nice-to-Have)

- [ ] **Higher-resolution artwork** — 2048×2048 or larger PNG
- [ ] **Custom project website**
- [ ] **Telegram Mini App integration**
- [ ] **Community channels set up**
- [ ] **Marketing assets prepared**

---

## Current Status

| Category | Progress |
|---|---|
| Artwork (current JPEG) | ✅ Preserved and organized |
| Metadata schemas | ✅ Created and TEP-64 compliant |
| Architecture plan | ✅ Documented |
| Testnet plan | ✅ Documented |
| Creator name | ❓ Awaiting user input |
| Smart contracts | ⏳ Not yet implemented |
| IPFS upload | ⏳ Not yet done |
| Testnet deployment | ⏳ Not yet attempted |
| Mainnet deployment | 🔒 Blocked until all above complete |
