import { Blockchain, SandboxContract, TreasuryContract } from '@ton/sandbox';
import { Cell, toNano, beginCell, Address } from '@ton/core';
import { NftCollection, createSnakeCell } from '../wrappers/NftCollection';
import { NftItem } from '../wrappers/NftItem';
import { compile } from '@ton/blueprint';
import '@ton/test-utils';

describe('Velvet Gremlins NFT Smart Contracts (Tolk)', () => {
    let collectionCode: Cell;
    let itemCode: Cell;

    let blockchain: Blockchain;
    let deployer: SandboxContract<TreasuryContract>;
    let admin: SandboxContract<TreasuryContract>;
    let royaltyRecipient: SandboxContract<TreasuryContract>;
    let founderOwner: SandboxContract<TreasuryContract>;
    let newOwner: SandboxContract<TreasuryContract>;
    let randomUser: SandboxContract<TreasuryContract>;

    let nftCollection: SandboxContract<NftCollection>;

    const COLLECTION_URI = 'https://raw.githubusercontent.com/velvet-gremlins/metadata/main/collection.json';
    const COMMON_CONTENT_BASE_URI = 'https://raw.githubusercontent.com/velvet-gremlins/metadata/main/';
    const FOUNDER_ITEM_URI = 'velvet-gremlin-000-founder.json';

    // 5% royalty = 50 / 1000
    const ROYALTY_NUMERATOR = 50;
    const ROYALTY_DENOMINATOR = 1000;

    beforeAll(async () => {
        collectionCode = await compile('NftCollection');
        itemCode = await compile('NftItem');
    });

    beforeEach(async () => {
        blockchain = await Blockchain.create();

        deployer = await blockchain.treasury('deployer');
        admin = await blockchain.treasury('admin');
        royaltyRecipient = await blockchain.treasury('royalty_recipient');
        founderOwner = await blockchain.treasury('founder_owner');
        newOwner = await blockchain.treasury('new_owner');
        randomUser = await blockchain.treasury('random_user');

        nftCollection = blockchain.openContract(
            NftCollection.createFromConfig(
                {
                    adminAddress: admin.address,
                    nextItemIndex: 0n,
                    collectionContentUri: COLLECTION_URI,
                    commonContentUri: COMMON_CONTENT_BASE_URI,
                    nftItemCode: itemCode,
                    royaltyParams: {
                        numerator: ROYALTY_NUMERATOR,
                        denominator: ROYALTY_DENOMINATOR,
                        royaltyAddress: royaltyRecipient.address,
                    },
                },
                collectionCode,
            ),
        );

        const deployResult = await nftCollection.sendDeploy(deployer.getSender(), toNano('0.1'));
        expect(deployResult.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            deploy: true,
            success: true,
        });
    });

    // Test 1: Collection Deployment & Initial State
    it('1. should deploy collection contract with correct initial state', async () => {
        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.nextItemIndex).toBe(0n);
        expect(collectionData.adminAddress.equals(admin.address)).toBe(true);
        expect(collectionData.collectionMetadata).toBeDefined();
    });

    // Test 2: Royalty parameters get-method (TEP-66)
    it('2. should return accurate royalty parameters (5% = 50/1000) via get-method', async () => {
        const royalty = await nftCollection.getRoyaltyParams();
        expect(royalty.numerator).toBe(50);
        expect(royalty.denominator).toBe(1000);
        expect(royalty.royaltyAddress.equals(royaltyRecipient.address)).toBe(true);
    });

    // Test 3: Royalty query response via message (TEP-66 opcode 0x693d3950)
    it('3. should respond to royalty query message with response opcode 0xa8cb00ad', async () => {
        const queryId = 12345n;
        const res = await nftCollection.sendRequestRoyaltyParams(randomUser.getSender(), {
            queryId,
            value: toNano('0.05'),
        });

        expect(res.transactions).toHaveTransaction({
            from: randomUser.address,
            to: nftCollection.address,
            success: true,
        });

        expect(res.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: randomUser.address,
            op: 0xa8cb00ad,
            success: true,
        });
    });

    // Test 4: Collection Metadata cell contains TEP-64 off-chain prefix
    it('4. should store collection metadata with TEP-64 off-chain prefix (0x01)', async () => {
        const collectionData = await nftCollection.getCollectionData();
        const slice = collectionData.collectionMetadata.beginParse();
        const prefix = slice.loadUint(8);
        expect(prefix).toBe(0x01);
        const storedUri = slice.loadBuffer(slice.remainingBits / 8).toString('utf8');
        expect(storedUri).toBe(COLLECTION_URI);
    });

    // Test 5: Mint Authorization - Non-admin cannot mint
    it('5. should reject minting when called by non-admin with ERROR_NOT_FROM_ADMIN (401)', async () => {
        const mintResult = await nftCollection.sendMintNft(randomUser.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: randomUser.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: randomUser.address,
            to: nftCollection.address,
            success: false,
            exitCode: 401,
        });

        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.nextItemIndex).toBe(0n);
    });

    // Test 6: Mint Validation - Cannot mint index greater than nextItemIndex
    it('6. should reject minting with invalid item index with ERROR_INVALID_ITEM_INDEX (402)', async () => {
        const mintResult = await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 5n, // nextItemIndex is 0
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: admin.address,
            to: nftCollection.address,
            success: false,
            exitCode: 402,
        });
    });

    // Test 7: Successful Minting of Velvet Gremlin #000 — Founder
    it('7. should allow admin to mint Velvet Gremlin #000 — Founder (index 0)', async () => {
        const expectedItemAddress = await nftCollection.getNftAddressByIndex(0n);

        const mintResult = await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        expect(mintResult.transactions).toHaveTransaction({
            from: admin.address,
            to: nftCollection.address,
            success: true,
        });

        // Verifies collection deployed the item contract
        expect(mintResult.transactions).toHaveTransaction({
            from: nftCollection.address,
            to: expectedItemAddress,
            deploy: true,
            success: true,
        });

        // Collection nextItemIndex advances to 1
        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.nextItemIndex).toBe(1n);
    });

    // Test 8: NFT Item verification (Owner, Collection Address, Item Index)
    it('8. should initialize NFT item #000 with correct owner, collection, and index', async () => {
        const itemAddress = await nftCollection.getNftAddressByIndex(0n);

        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        const nftItem = blockchain.openContract(NftItem.createFromAddress(itemAddress));
        const itemData = await nftItem.getNftData();

        expect(itemData.isInitialized).toBe(true);
        expect(itemData.itemIndex).toBe(0n);
        expect(itemData.collectionAddress.equals(nftCollection.address)).toBe(true);
        expect(itemData.ownerAddress).not.toBeNull();
        expect(itemData.ownerAddress!.equals(founderOwner.address)).toBe(true);
        expect(itemData.content).not.toBeNull();
    });

    // Test 9: NFT Address calculation consistency
    it('9. should deterministically calculate NFT item addresses matching contract state init', async () => {
        const calculatedAddress0 = await nftCollection.getNftAddressByIndex(0n);
        const calculatedAddress1 = await nftCollection.getNftAddressByIndex(1n);

        expect(calculatedAddress0.equals(calculatedAddress1)).toBe(false);

        // Pre-computed item with config should match get_nft_address_by_index
        const directItem = NftItem.createFromConfig(
            {
                itemIndex: 0n,
                collectionAddress: nftCollection.address,
            },
            itemCode,
        );
        expect(calculatedAddress0.equals(directItem.address)).toBe(true);
    });

    // Test 10: Metadata resolution via get_nft_content (TEP-64)
    it('10. should correctly compose common and individual metadata via get_nft_content', async () => {
        const individualContent = createSnakeCell(FOUNDER_ITEM_URI);
        const fullContentCell = await nftCollection.getNftContent(0n, individualContent);

        const slice = fullContentCell.beginParse();
        const prefix = slice.loadUint(8);
        expect(prefix).toBe(0x01);

        // Common base URI
        const commonSlice = slice.loadBuffer(slice.remainingBits / 8).toString('utf8');
        expect(commonSlice).toBe(COMMON_CONTENT_BASE_URI);

        // Individual item URI in ref
        const individualSlice = slice.loadRef().beginParse();
        const itemUri = individualSlice.loadBuffer(individualSlice.remainingBits / 8).toString('utf8');
        expect(itemUri).toBe(FOUNDER_ITEM_URI);
    });

    // Test 11: Static Data Request (TEP-62 opcode 0x2fcb26a2)
    it('11. should respond to static data request with index and collection address', async () => {
        const itemAddress = await nftCollection.getNftAddressByIndex(0n);

        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        const nftItem = blockchain.openContract(NftItem.createFromAddress(itemAddress));
        const queryId = 777n;
        const res = await nftItem.sendGetStaticData(randomUser.getSender(), {
            queryId,
            value: toNano('0.05'),
        });

        expect(res.transactions).toHaveTransaction({
            from: randomUser.address,
            to: itemAddress,
            success: true,
        });

        expect(res.transactions).toHaveTransaction({
            from: itemAddress,
            to: randomUser.address,
            op: 0x8b771735,
            success: true,
        });
    });

    // Test 12: Ownership Transfer (TEP-62 opcode 0x5fcc3d14)
    it('12. should allow current owner to transfer NFT to new owner with notification and excess return', async () => {
        const itemAddress = await nftCollection.getNftAddressByIndex(0n);

        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        const nftItem = blockchain.openContract(NftItem.createFromAddress(itemAddress));

        const forwardPayload = beginCell().storeUint(0x1234, 32).endCell();
        const transferResult = await nftItem.sendTransfer(founderOwner.getSender(), {
            queryId: 999n,
            value: toNano('0.1'),
            newOwnerAddress: newOwner.address,
            responseAddress: founderOwner.address,
            forwardAmount: toNano('0.02'),
            forwardPayload,
        });

        // Transfer succeeded
        expect(transferResult.transactions).toHaveTransaction({
            from: founderOwner.address,
            to: itemAddress,
            success: true,
        });

        // Notification to new owner (opcode 0x05138d91)
        expect(transferResult.transactions).toHaveTransaction({
            from: itemAddress,
            to: newOwner.address,
            op: 0x05138d91,
            value: toNano('0.02'),
            success: true,
        });

        // Excesses returned to responseAddress (opcode 0xd53276db)
        expect(transferResult.transactions).toHaveTransaction({
            from: itemAddress,
            to: founderOwner.address,
            op: 0xd53276db,
            success: true,
        });

        // Verify owner is updated
        const itemData = await nftItem.getNftData();
        expect(itemData.ownerAddress!.equals(newOwner.address)).toBe(true);
    });

    // Test 13: Transfer Authorization - Non-owner cannot transfer
    it('13. should reject transfer from non-owner with ERROR_NOT_FROM_OWNER (401)', async () => {
        const itemAddress = await nftCollection.getNftAddressByIndex(0n);

        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        const nftItem = blockchain.openContract(NftItem.createFromAddress(itemAddress));

        const transferResult = await nftItem.sendTransfer(randomUser.getSender(), {
            queryId: 100n,
            value: toNano('0.1'),
            newOwnerAddress: randomUser.address,
            responseAddress: randomUser.address,
        });

        expect(transferResult.transactions).toHaveTransaction({
            from: randomUser.address,
            to: itemAddress,
            success: false,
            exitCode: 401,
        });

        // Owner remains unchanged
        const itemData = await nftItem.getNftData();
        expect(itemData.ownerAddress!.equals(founderOwner.address)).toBe(true);
    });

    // Test 14: Transfer with insufficient value fails
    it('14. should reject transfer if balance is insufficient with ERROR_TOO_SMALL_REST_AMOUNT (402)', async () => {
        const itemAddress = await nftCollection.getNftAddressByIndex(0n);

        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        const nftItem = blockchain.openContract(NftItem.createFromAddress(itemAddress));

        // Forward amount 100 TON exceeds attached message value
        const transferResult = await nftItem.sendTransfer(founderOwner.getSender(), {
            queryId: 101n,
            value: toNano('0.01'),
            newOwnerAddress: newOwner.address,
            forwardAmount: toNano('100'),
        });

        expect(transferResult.transactions).toHaveTransaction({
            from: founderOwner.address,
            to: itemAddress,
            success: false,
            exitCode: 402,
        });
    });

    // Test 15: Admin Change Authorization & Handoff
    it('15. should allow admin to transfer admin rights and prevent former admin from minting', async () => {
        const newAdmin = await blockchain.treasury('new_admin');

        // Non-admin cannot change admin
        const unauthorizedChange = await nftCollection.sendChangeAdmin(randomUser.getSender(), {
            newAdminAddress: randomUser.address,
        });
        expect(unauthorizedChange.transactions).toHaveTransaction({
            from: randomUser.address,
            to: nftCollection.address,
            success: false,
            exitCode: 401,
        });

        // Admin changes admin
        const changeResult = await nftCollection.sendChangeAdmin(admin.getSender(), {
            newAdminAddress: newAdmin.address,
        });
        expect(changeResult.transactions).toHaveTransaction({
            from: admin.address,
            to: nftCollection.address,
            success: true,
        });

        const collectionData = await nftCollection.getCollectionData();
        expect(collectionData.adminAddress.equals(newAdmin.address)).toBe(true);

        // Former admin can no longer mint
        const oldAdminMint = await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
        });
        expect(oldAdminMint.transactions).toHaveTransaction({
            from: admin.address,
            to: nftCollection.address,
            success: false,
            exitCode: 401,
        });

        // New admin can mint
        const newAdminMint = await nftCollection.sendMintNft(newAdmin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
        });
        expect(newAdminMint.transactions).toHaveTransaction({
            from: newAdmin.address,
            to: nftCollection.address,
            success: true,
        });
    });

    // Test 16: Reject unknown message opcodes with 0xFFFF
    it('16. should reject unrecognized opcodes with 0xFFFF', async () => {
        const invalidBody = beginCell().storeUint(0xdeadbeef, 32).storeUint(0, 64).endCell();

        const res = await deployer.send({
            to: nftCollection.address,
            value: toNano('0.05'),
            body: invalidBody,
        });

        expect(res.transactions).toHaveTransaction({
            from: deployer.address,
            to: nftCollection.address,
            success: false,
            exitCode: 0xffff,
        });
    });

    // Test 17: NFT Item Uninitialized state query
    it('17. should return isInitialized = false for deployed uninitialized item contract', async () => {
        const uninitedItem = blockchain.openContract(
            NftItem.createFromConfig(
                {
                    itemIndex: 42n,
                    collectionAddress: nftCollection.address,
                },
                itemCode,
            ),
        );

        await deployer.send({
            to: uninitedItem.address,
            value: toNano('0.05'),
            init: uninitedItem.init,
            body: beginCell().endCell(),
        });

        const data = await uninitedItem.getNftData();
        expect(data.isInitialized).toBe(false);
        expect(data.itemIndex).toBe(42n);
        expect(data.collectionAddress.equals(nftCollection.address)).toBe(true);
        expect(data.ownerAddress).toBeNull();
        expect(data.content).toBeNull();
    });

    // Test 18: NFT Item Initialization Security - Only collection can initialize
    it('18. should reject initialization of item from non-collection sender with ERROR_NOT_FROM_COLLECTION (405)', async () => {
        const uninitedItem = blockchain.openContract(
            NftItem.createFromConfig(
                {
                    itemIndex: 99n,
                    collectionAddress: nftCollection.address,
                },
                itemCode,
            ),
        );

        // Deploy uninited item state init
        const fakeInitParams = beginCell()
            .storeAddress(randomUser.address)
            .storeRef(createSnakeCell('fake.json'))
            .endCell();

        // Random user sends init directly to item contract
        const initAttempt = await randomUser.send({
            to: uninitedItem.address,
            value: toNano('0.05'),
            body: fakeInitParams,
            init: uninitedItem.init,
        });

        expect(initAttempt.transactions).toHaveTransaction({
            from: randomUser.address,
            to: uninitedItem.address,
            success: false,
            exitCode: 405, // ERROR_NOT_FROM_COLLECTION
        });
    });

    // Test 19: Workchain validation on transfer
    it('19. should reject transfer with invalid workchain recipient with ERROR_INVALID_WORKCHAIN (333)', async () => {
        const itemAddress = await nftCollection.getNftAddressByIndex(0n);

        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        const nftItem = blockchain.openContract(NftItem.createFromAddress(itemAddress));

        // Masterchain address (workchain -1)
        const masterchainRecipient = Address.parse(
            '-1:0000000000000000000000000000000000000000000000000000000000000000',
        );

        const transferResult = await nftItem.sendTransfer(founderOwner.getSender(), {
            queryId: 200n,
            value: toNano('0.1'),
            newOwnerAddress: masterchainRecipient,
        });

        expect(transferResult.transactions).toHaveTransaction({
            from: founderOwner.address,
            to: itemAddress,
            success: false,
            exitCode: 333,
        });
    });

    // Test 20: Duplicate minting does not increment nextItemIndex
    it('20. should not advance nextItemIndex when minting an already minted index', async () => {
        // Mint index 0
        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        let collectionData = await nftCollection.getCollectionData();
        expect(collectionData.nextItemIndex).toBe(1n);

        // Attempt to mint index 0 again (itemIndex 0 <= nextItemIndex 1)
        await nftCollection.sendMintNft(admin.getSender(), {
            itemIndex: 0n,
            itemOwnerAddress: founderOwner.address,
            itemContentUri: FOUNDER_ITEM_URI,
            amount: toNano('0.05'),
            value: toNano('0.08'),
        });

        // nextItemIndex should still be 1 because isLast is false (0 != 1)
        collectionData = await nftCollection.getCollectionData();
        expect(collectionData.nextItemIndex).toBe(1n);
    });
});
