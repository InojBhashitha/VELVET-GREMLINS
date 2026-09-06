import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    TupleBuilder,
} from '@ton/core';

export interface RoyaltyParams {
    numerator: number;
    denominator: number;
    royaltyAddress: Address;
}

export interface NftCollectionConfig {
    adminAddress: Address;
    nextItemIndex: bigint | number;
    collectionContentUri: string;
    commonContentUri: string;
    nftItemCode: Cell;
    royaltyParams: RoyaltyParams;
}

export function createSnakeCell(content: string | Buffer): Cell {
    const buffer = typeof content === 'string' ? Buffer.from(content, 'utf8') : content;
    const root = beginCell();
    let currentCell = root;
    let offset = 0;

    while (offset < buffer.length) {
        const slice = buffer.subarray(offset, offset + 127);
        currentCell.storeBuffer(slice);
        offset += 127;
        if (offset < buffer.length) {
            const nextCell = beginCell();
            currentCell.storeRef(nextCell.asCell());
            currentCell = nextCell;
        }
    }
    return root.endCell();
}

export function createOffchainMetadataCell(uri: string): Cell {
    return beginCell().storeUint(0x01, 8).storeBuffer(Buffer.from(uri, 'utf8')).endCell();
}

export function buildCollectionContentCell(collectionContentUri: string, commonContentUri: string): Cell {
    const collectionMetadata = createOffchainMetadataCell(collectionContentUri);
    const commonContent = createSnakeCell(commonContentUri);

    return beginCell().storeRef(collectionMetadata).storeRef(commonContent).endCell();
}

export function buildRoyaltyParamsCell(params: RoyaltyParams): Cell {
    return beginCell()
        .storeUint(params.numerator, 16)
        .storeUint(params.denominator, 16)
        .storeAddress(params.royaltyAddress)
        .endCell();
}

export function nftCollectionConfigToCell(config: NftCollectionConfig): Cell {
    const contentCell = buildCollectionContentCell(config.collectionContentUri, config.commonContentUri);
    const royaltyCell = buildRoyaltyParamsCell(config.royaltyParams);

    return beginCell()
        .storeAddress(config.adminAddress)
        .storeUint(BigInt(config.nextItemIndex), 64)
        .storeRef(contentCell)
        .storeRef(config.nftItemCode)
        .storeRef(royaltyCell)
        .endCell();
}

export class NftCollection implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new NftCollection(address);
    }

    static createFromConfig(config: NftCollectionConfig, code: Cell, workchain = 0) {
        const data = nftCollectionConfigToCell(config);
        const init = { code, data };
        return new NftCollection(contractAddress(workchain, init), init);
    }

    async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
        await provider.internal(via, {
            value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: beginCell().endCell(),
        });
    }

    async sendMintNft(
        provider: ContractProvider,
        via: Sender,
        opts: {
            queryId?: bigint;
            itemIndex: bigint | number;
            itemOwnerAddress: Address;
            itemContentUri: string;
            amount: bigint;
            value?: bigint;
        },
    ) {
        const initParams = beginCell()
            .storeAddress(opts.itemOwnerAddress)
            .storeRef(createSnakeCell(opts.itemContentUri))
            .endCell();

        const body = beginCell()
            .storeUint(1, 32) // opcode DeployNft
            .storeUint(opts.queryId ?? 0n, 64)
            .storeUint(BigInt(opts.itemIndex), 64)
            .storeCoins(opts.amount)
            .storeRef(initParams)
            .endCell();

        await provider.internal(via, {
            value: opts.value ?? opts.amount + 20000000n, // default +0.02 TON for fees
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendChangeAdmin(
        provider: ContractProvider,
        via: Sender,
        opts: {
            queryId?: bigint;
            newAdminAddress: Address;
            value?: bigint;
        },
    ) {
        const body = beginCell()
            .storeUint(3, 32) // opcode ChangeCollectionAdmin
            .storeUint(opts.queryId ?? 0n, 64)
            .storeAddress(opts.newAdminAddress)
            .endCell();

        await provider.internal(via, {
            value: opts.value ?? 20000000n,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async sendRequestRoyaltyParams(
        provider: ContractProvider,
        via: Sender,
        opts?: {
            queryId?: bigint;
            value?: bigint;
        },
    ) {
        const body = beginCell()
            .storeUint(0x693d3950, 32)
            .storeUint(opts?.queryId ?? 0n, 64)
            .endCell();

        await provider.internal(via, {
            value: opts?.value ?? 20000000n,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async getCollectionData(provider: ContractProvider): Promise<{
        nextItemIndex: bigint;
        collectionMetadata: Cell;
        adminAddress: Address;
    }> {
        const result = await provider.get('get_collection_data', []);
        const nextItemIndex = result.stack.readBigNumber();
        const collectionMetadata = result.stack.readCell();
        const adminAddress = result.stack.readAddress();

        return {
            nextItemIndex,
            collectionMetadata,
            adminAddress,
        };
    }

    async getNftAddressByIndex(provider: ContractProvider, index: bigint | number): Promise<Address> {
        const tb = new TupleBuilder();
        tb.writeNumber(Number(index));
        const result = await provider.get('get_nft_address_by_index', tb.build());
        return result.stack.readAddress();
    }

    async getRoyaltyParams(provider: ContractProvider): Promise<RoyaltyParams> {
        const result = await provider.get('royalty_params', []);
        const numerator = result.stack.readNumber();
        const denominator = result.stack.readNumber();
        const royaltyAddress = result.stack.readAddress();

        return {
            numerator,
            denominator,
            royaltyAddress,
        };
    }

    async getNftContent(provider: ContractProvider, index: bigint | number, individualContent: Cell): Promise<Cell> {
        const tb = new TupleBuilder();
        tb.writeNumber(Number(index));
        tb.writeCell(individualContent);
        const result = await provider.get('get_nft_content', tb.build());
        return result.stack.readCell();
    }
}
