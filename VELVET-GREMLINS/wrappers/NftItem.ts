import { Address, beginCell, Cell, Contract, contractAddress, ContractProvider, Sender, SendMode } from '@ton/core';

export interface NftItemConfig {
    itemIndex: bigint | number;
    collectionAddress: Address;
}

export function nftItemConfigToCell(config: NftItemConfig): Cell {
    return beginCell().storeUint(BigInt(config.itemIndex), 64).storeAddress(config.collectionAddress).endCell();
}

export class NftItem implements Contract {
    constructor(
        readonly address: Address,
        readonly init?: { code: Cell; data: Cell },
    ) {}

    static createFromAddress(address: Address) {
        return new NftItem(address);
    }

    static createFromConfig(config: NftItemConfig, code: Cell, workchain = 0) {
        const data = nftItemConfigToCell(config);
        const init = { code, data };
        return new NftItem(contractAddress(workchain, init), init);
    }

    async sendTransfer(
        provider: ContractProvider,
        via: Sender,
        opts: {
            queryId?: bigint;
            value: bigint;
            newOwnerAddress: Address;
            responseAddress?: Address | null;
            customPayload?: Cell | null;
            forwardAmount?: bigint;
            forwardPayload?: Cell | null;
        },
    ) {
        const builder = beginCell()
            .storeUint(0x5fcc3d14, 32) // opcode AskToChangeOwnership
            .storeUint(opts.queryId ?? 0n, 64)
            .storeAddress(opts.newOwnerAddress)
            .storeAddress(opts.responseAddress ?? null);

        if (opts.customPayload) {
            builder.storeBit(1);
            builder.storeRef(opts.customPayload);
        } else {
            builder.storeBit(0);
        }

        builder.storeCoins(opts.forwardAmount ?? 0n);

        if (opts.forwardPayload) {
            builder.storeBit(1);
            builder.storeRef(opts.forwardPayload);
        } else {
            builder.storeBit(0);
        }

        await provider.internal(via, {
            value: opts.value,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body: builder.endCell(),
        });
    }

    async sendGetStaticData(
        provider: ContractProvider,
        via: Sender,
        opts?: {
            queryId?: bigint;
            value?: bigint;
        },
    ) {
        const body = beginCell()
            .storeUint(0x2fcb26a2, 32) // opcode RequestStaticData
            .storeUint(opts?.queryId ?? 0n, 64)
            .endCell();

        await provider.internal(via, {
            value: opts?.value ?? 20000000n,
            sendMode: SendMode.PAY_GAS_SEPARATELY,
            body,
        });
    }

    async getNftData(provider: ContractProvider): Promise<{
        isInitialized: boolean;
        itemIndex: bigint;
        collectionAddress: Address;
        ownerAddress: Address | null;
        content: Cell | null;
    }> {
        const result = await provider.get('get_nft_data', []);
        const isInitialized = result.stack.readBoolean();
        const itemIndex = result.stack.readBigNumber();
        const collectionAddress = result.stack.readAddress();

        if (!isInitialized) {
            return {
                isInitialized: false,
                itemIndex,
                collectionAddress,
                ownerAddress: null,
                content: null,
            };
        }

        const ownerAddress = result.stack.readAddress();
        const content = result.stack.readCellOpt();

        return {
            isInitialized: true,
            itemIndex,
            collectionAddress,
            ownerAddress,
            content,
        };
    }
}
