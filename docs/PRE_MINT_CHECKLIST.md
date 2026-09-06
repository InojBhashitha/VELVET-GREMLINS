# Velvet Gremlins — Pre-Mint Checklist

> Everything that must be ready before the Founder NFT can be minted on TON mainnet.
> Last updated: 2026-09-06

---

## 🔴 Critical (Must-Have — Blocks Minting)

### Artwork

- [x] **Final artwork format decided** — Lossless transparent PNG (primary source)
- [x] **Final artwork file prepared** — Master transparent PNG in `collection/artwork/velvet-gremlin-000-founder.png`
- [x] **Staging & IPFS upload pipeline ready** — `npm run upload:ipfs` tool configured with Pinata & manual modes
- [x] **Artwork uploaded to IPFS/Arweave** — Pinned to Pinata (CID: `bafybeicltd7h7fgjinxctxsg7dffhap77n2eg7v64f7zwtmmotr453mwx4`)
- [x] **Image URI confirmed** — `ipfs://bafybeicltd7h7fgjinxctxsg7dffhap77n2eg7v64f7zwtmmotr453mwx4` in metadata

### Metadata

- [x] **Item metadata finalized** — `velvet-gremlin-000-founder.json` with real IPFS image URI
- [x] **Collection metadata finalized** — `collection.json` with real IPFS image URI and creator attribution
- [x] **Metadata uploaded to IPFS** — Directory pinned to Pinata (CID: `bafybeiblxl4acrhgoqsjmar5irej4dey3krk5j3m7enlwskpq5sul3j2m4`)
- [x] **Metadata URIs confirmed** — Real URIs ready for contract deployment in `.env`

### Identity

- [x] **Creator/artist name confirmed** — Set to "Velvet Gremlins" in collection metadata
- [x] **Owner wallet address confirmed** — Defaults to deployer wallet (configurable via .env)
- [x] **Royalty destination address confirmed** — Defaults to deployer wallet (5% royalty, configurable via .env)

### Smart Contracts

- [x] **Collection contract implemented** — TEP-62 + TEP-66 compliant in Tolk
- [x] **Item contract implemented** — TEP-62 compliant in Tolk
- [x] **All Sandbox tests pass** — Full test coverage (20 tests passing) for mint, transfer, royalty, metadata
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
| Artwork (lossless master PNG & JPEG archive) | ✅ Preserved and organized |
| Metadata schemas | ✅ Created and TEP-64 compliant |
| Architecture plan | ✅ Documented |
| Testnet plan | ✅ Documented |
| Creator name | ✅ Set to "Velvet Gremlins" |
| Smart contracts | ✅ Implemented in Tolk (20 unit tests passing) |
| IPFS upload pipeline | ✅ Artwork & metadata pinned to IPFS |
| Testnet deployment | ⏳ Ready to deploy with Tonkeeper |
| Mainnet deployment | 🔒 Blocked until testnet verification complete |
