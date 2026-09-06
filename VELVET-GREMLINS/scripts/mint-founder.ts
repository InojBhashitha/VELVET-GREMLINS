import dotenv from 'dotenv';
import { toNano, Address } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { NftItem } from '../wrappers/NftItem';
import { NetworkProvider } from '@ton/blueprint';

dotenv.config();

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const sender = provider.sender();

    if (!sender.address) {
        throw new Error('Signer wallet address is required.');
    }

    const collectionAddressStr =
        process.env.COLLECTION_ADDRESS || (await ui.input('Enter deployed Velvet Gremlins Collection address:'));

    if (!collectionAddressStr) {
        throw new Error('Collection address is required.');
    }

    const collectionAddress = Address.parse(collectionAddressStr);
    const nftCollection = provider.open(NftCollection.createFromAddress(collectionAddress));

    const collectionData = await nftCollection.getCollectionData();
    ui.write('--- Velvet Gremlins Collection Status ---');
    ui.write(`Collection Address: ${collectionAddress.toString()}`);
    ui.write(`Current Next Item Index: ${collectionData.nextItemIndex}`);
    ui.write(`Collection Admin: ${collectionData.adminAddress.toString()}`);

    if (collectionData.nextItemIndex > 0n) {
        ui.write(
            `NOTICE: nextItemIndex is currently ${collectionData.nextItemIndex}. Founder NFT (#000) was likely already minted.`,
        );
    }

    const founderOwnerAddress = process.env.FOUNDER_OWNER_ADDRESS
        ? Address.parse(process.env.FOUNDER_OWNER_ADDRESS)
        : sender.address;

    const founderItemUri = process.env.FOUNDER_METADATA_URI || 'velvet-gremlin-000-founder.json';

    const mintIndex = 0n;
    const prospectiveItemAddress = await nftCollection.getNftAddressByIndex(mintIndex);

    ui.write('--- Minting Velvet Gremlin #000 — Founder (1/1) ---');
    ui.write(`Item Index: ${mintIndex}`);
    ui.write(`Recipient Address: ${founderOwnerAddress.toString()}`);
    ui.write(`Item Metadata URI: ${founderItemUri}`);
    ui.write(`Target Item Address: ${prospectiveItemAddress.toString()}`);

    await nftCollection.sendMintNft(sender, {
        itemIndex: mintIndex,
        itemOwnerAddress: founderOwnerAddress,
        itemContentUri: founderItemUri,
        amount: toNano('0.05'), // attached to NFT item for storage fees
        value: toNano('0.08'), // total value
    });

    ui.write('Mint transaction sent! Waiting for NFT item initialization...');
    await provider.waitForDeploy(prospectiveItemAddress);

    const nftItem = provider.open(NftItem.createFromAddress(prospectiveItemAddress));
    const itemData = await nftItem.getNftData();

    ui.write('🎉 Velvet Gremlin #000 — Founder successfully minted!');
    ui.write(`NFT Address: ${prospectiveItemAddress.toString()}`);
    ui.write(`Owner Address: ${itemData.ownerAddress?.toString()}`);
    ui.write(`Item Index: ${itemData.itemIndex}`);
    ui.write(`Initialized: ${itemData.isInitialized}`);
}
