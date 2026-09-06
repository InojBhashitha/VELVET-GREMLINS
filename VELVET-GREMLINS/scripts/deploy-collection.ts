import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { toNano, Address } from '@ton/core';
import { NftCollection } from '../wrappers/NftCollection';
import { compile, NetworkProvider } from '@ton/blueprint';

dotenv.config();

export async function run(provider: NetworkProvider) {
    const ui = provider.ui();
    const sender = provider.sender();

    if (!sender.address) {
        throw new Error('Deployer wallet address is required.');
    }

    const network = provider.network();
    ui.write(`Deploying to network: ${network}`);
    if (network === 'mainnet') {
        ui.write('WARNING: Mainnet deployment detected. Velvet Gremlins is currently in Phase 3 testnet preparation.');
    }

    const adminAddress = process.env.COLLECTION_ADMIN_ADDRESS
        ? Address.parse(process.env.COLLECTION_ADMIN_ADDRESS)
        : sender.address;

    const royaltyAddress = process.env.COLLECTION_ROYALTY_ADDRESS
        ? Address.parse(process.env.COLLECTION_ROYALTY_ADDRESS)
        : sender.address;

    const collectionMetadataUri =
        process.env.COLLECTION_METADATA_URI ||
        'https://raw.githubusercontent.com/velvet-gremlins/metadata/main/collection.json';

    const commonContentBaseUri =
        process.env.COMMON_CONTENT_BASE_URI || 'https://raw.githubusercontent.com/velvet-gremlins/metadata/main/';

    // 5% royalty (50 / 1000) as per project specification
    const royaltyNumerator = 50;
    const royaltyDenominator = 1000;

    ui.write('--- Velvet Gremlins NFT Collection Configuration ---');
    ui.write(`Admin Address: ${adminAddress.toString()}`);
    ui.write(`Royalty Address: ${royaltyAddress.toString()}`);
    ui.write(
        `Royalty Rate: ${(royaltyNumerator / royaltyDenominator) * 100}% (${royaltyNumerator}/${royaltyDenominator})`,
    );
    ui.write(`Collection Metadata URI: ${collectionMetadataUri}`);
    ui.write(`Common Content Base URI: ${commonContentBaseUri}`);

    ui.write('Compiling contracts...');
    const collectionCode = await compile('NftCollection');
    const itemCode = await compile('NftItem');

    const nftCollection = provider.open(
        NftCollection.createFromConfig(
            {
                adminAddress,
                nextItemIndex: 0n,
                collectionContentUri: collectionMetadataUri,
                commonContentUri: commonContentBaseUri,
                nftItemCode: itemCode,
                royaltyParams: {
                    numerator: royaltyNumerator,
                    denominator: royaltyDenominator,
                    royaltyAddress,
                },
            },
            collectionCode,
        ),
    );

    ui.write(`Target Collection Address: ${nftCollection.address.toString()}`);

    await nftCollection.sendDeploy(sender, toNano('0.1'));

    await provider.waitForDeploy(nftCollection.address);

    ui.write('✅ Velvet Gremlins NFT Collection successfully deployed!');
    ui.write(`Collection Address: ${nftCollection.address.toString()}`);

    const envPath = path.resolve(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
        let envContent = fs.readFileSync(envPath, 'utf-8');
        const regex = /^COLLECTION_ADDRESS=.*$/m;
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `COLLECTION_ADDRESS=${nftCollection.address.toString()}`);
        } else {
            envContent += `\nCOLLECTION_ADDRESS=${nftCollection.address.toString()}`;
        }
        fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
        ui.write(`Auto-saved COLLECTION_ADDRESS to ${envPath}`);
    }
}
