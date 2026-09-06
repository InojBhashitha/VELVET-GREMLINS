import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const projectRoot = path.resolve(__dirname, '../..');
const collectionArtworkFile = path.resolve(projectRoot, 'collection/artwork/velvet-gremlin-000-founder.png');
const collectionMetadataFile = path.resolve(projectRoot, 'collection/metadata/collection.json');
const founderMetadataFile = path.resolve(projectRoot, 'collection/metadata/velvet-gremlin-000-founder.json');
const distIpfsDir = path.resolve(projectRoot, 'dist/ipfs');
const distArtworkDir = path.resolve(distIpfsDir, 'artwork');
const distMetadataDir = path.resolve(distIpfsDir, 'metadata');

interface PinataAuthResponse {
    message: string;
}

interface PinataPinResponse {
    IpfsHash: string;
    PinSize: number;
    Timestamp: string;
}

function ensureDirectoryExists(dir: string) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function stageLocalFiles(): { artworkPath: string; collectionJsonPath: string; founderJsonPath: string } {
    ensureDirectoryExists(distArtworkDir);
    ensureDirectoryExists(distMetadataDir);

    if (!fs.existsSync(collectionArtworkFile)) {
        throw new Error(`Artwork master not found at: ${collectionArtworkFile}`);
    }

    const stagedArtwork = path.resolve(distArtworkDir, 'velvet-gremlin-000-founder.png');
    fs.copyFileSync(collectionArtworkFile, stagedArtwork);

    const collectionData = JSON.parse(fs.readFileSync(collectionMetadataFile, 'utf-8'));
    const founderData = JSON.parse(fs.readFileSync(founderMetadataFile, 'utf-8'));

    const stagedCollectionJson = path.resolve(distMetadataDir, 'collection.json');
    const stagedFounderJson = path.resolve(distMetadataDir, 'velvet-gremlin-000-founder.json');

    fs.writeFileSync(stagedCollectionJson, JSON.stringify(collectionData, null, 2), 'utf-8');
    fs.writeFileSync(stagedFounderJson, JSON.stringify(founderData, null, 2), 'utf-8');

    return {
        artworkPath: stagedArtwork,
        collectionJsonPath: stagedCollectionJson,
        founderJsonPath: stagedFounderJson,
    };
}

async function testPinataAuth(jwt: string): Promise<boolean> {
    try {
        const res = await fetch('https://api.pinata.cloud/data/testAuthentication', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${jwt}`,
            },
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error(`Pinata authentication failed (${res.status}): ${errText}`);
            return false;
        }
        const data = (await res.json()) as PinataAuthResponse;
        console.log(`Pinata auth successful: ${data.message}`);
        return true;
    } catch (err: any) {
        console.error(`Error connecting to Pinata API: ${err.message}`);
        return false;
    }
}

async function pinFileToPinata(
    jwt: string,
    filePath: string,
    pinataMetadataName: string,
    customKeyValues?: Record<string, string>,
): Promise<string> {
    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    const fileBlob = new Blob([new Uint8Array(fileBuffer)]);
    formData.append('file', fileBlob, fileName);

    const metadata = {
        name: pinataMetadataName,
        keyvalues: customKeyValues || {},
    };
    formData.append('pinataMetadata', JSON.stringify(metadata));

    const options = {
        cidVersion: 1,
    };
    formData.append('pinataOptions', JSON.stringify(options));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${jwt}`,
        },
        body: formData,
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to pin file ${fileName} to Pinata: ${res.status} - ${errorText}`);
    }

    const json = (await res.json()) as PinataPinResponse;
    return json.IpfsHash;
}

async function pinDirectoryToPinata(
    jwt: string,
    files: Array<{ relativePath: string; content: Buffer | string }>,
    folderName: string,
    customKeyValues?: Record<string, string>,
): Promise<string> {
    const formData = new FormData();

    for (const f of files) {
        const buf = typeof f.content === 'string' ? Buffer.from(f.content, 'utf-8') : f.content;
        const blob = new Blob([new Uint8Array(buf)]);
        // To pin as directory on Pinata, filename in FormData should include folder prefix
        formData.append('file', blob, `${folderName}/${f.relativePath}`);
    }

    const metadata = {
        name: folderName,
        keyvalues: customKeyValues || {},
    };
    formData.append('pinataMetadata', JSON.stringify(metadata));

    const options = {
        cidVersion: 1,
    };
    formData.append('pinataOptions', JSON.stringify(options));

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${jwt}`,
        },
        body: formData,
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to pin directory ${folderName} to Pinata: ${res.status} - ${errorText}`);
    }

    const json = (await res.json()) as PinataPinResponse;
    return json.IpfsHash;
}

function updateEnvFile(updates: Record<string, string>) {
    const envPath = path.resolve(__dirname, '../.env');
    let envContent = '';
    if (fs.existsSync(envPath)) {
        envContent = fs.readFileSync(envPath, 'utf-8');
    } else {
        const examplePath = path.resolve(__dirname, '../.env.example');
        if (fs.existsSync(examplePath)) {
            envContent = fs.readFileSync(examplePath, 'utf-8');
        }
    }

    for (const [key, value] of Object.entries(updates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (regex.test(envContent)) {
            envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
            envContent += `\n${key}=${value}`;
        }
    }

    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf-8');
    console.log(`Updated environment configuration at: ${envPath}`);
}

function updateMetadataFiles(artworkCid: string, metadataFolderCid?: string) {
    const imageUri = `ipfs://${artworkCid}`;
    const imageGatewayUrl = `https://ipfs.io/ipfs/${artworkCid}`;

    // Update Founder item metadata
    const founderData = JSON.parse(fs.readFileSync(founderMetadataFile, 'utf-8'));
    founderData.image = imageUri;
    founderData.content_url = imageUri;
    fs.writeFileSync(founderMetadataFile, JSON.stringify(founderData, null, 2) + '\n', 'utf-8');

    // Update Collection metadata
    const collectionData = JSON.parse(fs.readFileSync(collectionMetadataFile, 'utf-8'));
    collectionData.image = imageUri;
    if (collectionData.cover_image && collectionData.cover_image.startsWith('<PLACEHOLDER')) {
        // Omit or leave empty if not yet available to avoid broken banner queries
        delete collectionData.cover_image;
    }
    fs.writeFileSync(collectionMetadataFile, JSON.stringify(collectionData, null, 2) + '\n', 'utf-8');

    console.log('✅ Updated collection/metadata/collection.json with artwork URI');
    console.log('✅ Updated collection/metadata/velvet-gremlin-000-founder.json with artwork URI');
}

export async function main() {
    const args = process.argv.slice(2);
    console.log('=====================================================');
    console.log('  Velvet Gremlins — Decentralized Storage (IPFS) Tool');
    console.log('=====================================================');

    // 1. Stage local assets
    console.log('\n[1/3] Staging local files for decentralized upload...');
    const staged = stageLocalFiles();
    console.log(`Staged master PNG: ${staged.artworkPath}`);
    console.log(`Staged collection JSON: ${staged.collectionJsonPath}`);
    console.log(`Staged founder JSON: ${staged.founderJsonPath}`);

    // Check if manual CID flags were provided
    if (args.includes('--set-cids')) {
        const cidIndex = args.indexOf('--set-cids');
        const artworkCid = args[cidIndex + 1];
        const metadataFolderCid = args[cidIndex + 2];

        if (!artworkCid) {
            console.error('Usage: ts-node scripts/upload-ipfs.ts --set-cids <ARTWORK_CID> [METADATA_FOLDER_CID]');
            process.exit(1);
        }

        console.log(`\nManually applying artwork CID: ${artworkCid}`);
        if (metadataFolderCid) {
            console.log(`Applying metadata folder CID: ${metadataFolderCid}`);
        }

        updateMetadataFiles(artworkCid, metadataFolderCid);

        if (metadataFolderCid) {
            updateEnvFile({
                COLLECTION_METADATA_URI: `ipfs://${metadataFolderCid}/collection.json`,
                COMMON_CONTENT_BASE_URI: `ipfs://${metadataFolderCid}/`,
                FOUNDER_METADATA_URI: 'velvet-gremlin-000-founder.json',
            });
        }
        console.log('\n✅ CIDs successfully updated across project!');
        return;
    }

    const pinataJwt = process.env.PINATA_JWT;

    if (!pinataJwt) {
        console.log('\n[INFO] No PINATA_JWT found in environment or .env file.');
        console.log('\nYou have 2 simple options to finalize IPFS upload:');
        console.log('\n--- OPTION A: Automated Upload via Pinata API (1 minute) ---');
        console.log('1. Go to https://app.pinata.cloud/developers/api-keys');
        console.log('2. Create a free API Key with "pinFileToIPFS" permissions.');
        console.log('3. Copy your JWT token and set it in your VELVET-GREMLINS/.env:');
        console.log('   PINATA_JWT=your_jwt_here');
        console.log('4. Re-run: npm run upload:ipfs');
        console.log('\n--- OPTION B: Manual Web UI Upload (Drag & Drop) ---');
        console.log(`1. Upload the artwork file to Pinata / Web3.storage / Lighthouse:`);
        console.log(`   File: ${staged.artworkPath}`);
        console.log(`2. Note the generated Artwork CID (e.g. bafybeic...)`);
        console.log(`3. Run this script to update the metadata files:`);
        console.log(`   npx ts-node scripts/upload-ipfs.ts --set-cids <ARTWORK_CID>`);
        console.log(`4. Upload the metadata directory to Pinata:`);
        console.log(`   Folder: ${distMetadataDir}`);
        console.log(`5. Link the metadata folder CID:`);
        console.log(`   npx ts-node scripts/upload-ipfs.ts --set-cids <ARTWORK_CID> <METADATA_FOLDER_CID>`);
        console.log('=====================================================\n');
        return;
    }

    // 2. Automated Pinata Pinning
    console.log('\n[2/3] Authenticating with Pinata...');
    const authed = await testPinataAuth(pinataJwt);
    if (!authed) {
        console.error('Authentication failed. Please verify your PINATA_JWT in .env.');
        process.exit(1);
    }

    console.log('\n[3/3] Pinning assets to IPFS via Pinata API...');

    // Step A: Pin Master Transparent Artwork
    console.log('1. Uploading velvet-gremlin-000-founder.png (2.78 MB)...');
    const artworkCid = await pinFileToPinata(
        pinataJwt,
        collectionArtworkFile,
        'velvet-gremlin-000-founder.png',
        { project: 'Velvet Gremlins', role: 'Founder Master Artwork' },
    );
    console.log(`   ✅ Artwork pinned! CID: ${artworkCid}`);
    console.log(`   IPFS URI: ipfs://${artworkCid}`);
    console.log(`   Gateway: https://ipfs.io/ipfs/${artworkCid}`);

    // Step B: Update local metadata with artwork CID
    updateMetadataFiles(artworkCid);

    // Step C: Pin Metadata Directory (collection.json + velvet-gremlin-000-founder.json)
    console.log('2. Uploading metadata directory to IPFS...');
    const metadataFiles = [
        {
            relativePath: 'collection.json',
            content: fs.readFileSync(collectionMetadataFile),
        },
        {
            relativePath: 'velvet-gremlin-000-founder.json',
            content: fs.readFileSync(founderMetadataFile),
        },
    ];

    const metadataFolderCid = await pinDirectoryToPinata(
        pinataJwt,
        metadataFiles,
        'velvet-gremlins-metadata',
        { project: 'Velvet Gremlins', role: 'Metadata Directory' },
    );

    console.log(`   ✅ Metadata directory pinned! CID: ${metadataFolderCid}`);
    console.log(`   Collection URI: ipfs://${metadataFolderCid}/collection.json`);
    console.log(`   Common Base URI: ipfs://${metadataFolderCid}/`);
    console.log(`   Founder Item URI: velvet-gremlin-000-founder.json`);

    // Step D: Update .env configuration
    const envUpdates = {
        COLLECTION_METADATA_URI: `ipfs://${metadataFolderCid}/collection.json`,
        COMMON_CONTENT_BASE_URI: `ipfs://${metadataFolderCid}/`,
        FOUNDER_METADATA_URI: 'velvet-gremlin-000-founder.json',
    };
    updateEnvFile(envUpdates);

    console.log('\n=====================================================');
    console.log('🎉 Decentralized Storage Preparation Complete!');
    console.log('All CIDs have been pinned and written into .env & metadata.');
    console.log('You are ready for Testnet Deployment!');
    console.log('=====================================================\n');
}

if (require.main === module) {
    main().catch((err) => {
        console.error('Fatal error during IPFS upload:', err);
        process.exit(1);
    });
}
