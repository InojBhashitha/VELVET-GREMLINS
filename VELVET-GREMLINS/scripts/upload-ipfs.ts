import fs from 'fs';
import path from 'path';
import https from 'https';
import crypto from 'crypto';
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

function getAuthHeaders(): Record<string, string> {
    if (process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET) {
        return {
            pinata_api_key: process.env.PINATA_API_KEY,
            pinata_secret_api_key: process.env.PINATA_API_SECRET,
        };
    }
    if (process.env.PINATA_JWT) {
        return {
            Authorization: `Bearer ${process.env.PINATA_JWT}`,
        };
    }
    throw new Error('No Pinata credentials found in .env (expected PINATA_API_KEY / PINATA_API_SECRET or PINATA_JWT)');
}

function testPinataAuth(): Promise<PinataAuthResponse> {
    return new Promise((resolve, reject) => {
        const headers = getAuthHeaders();
        const req = https.get(
            'https://api.pinata.cloud/data/testAuthentication',
            { family: 4, headers },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`Pinata auth failed (${res.statusCode}): ${data}`));
                    }
                });
            },
        );
        req.on('error', reject);
    });
}

function pinFileToPinata(filePath: string, pinataMetadataName: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const fileBuffer = fs.readFileSync(filePath);
        const fileName = path.basename(filePath);
        const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
        const authHeaders = getAuthHeaders();

        const metaJson = JSON.stringify({ name: pinataMetadataName });
        const optsJson = JSON.stringify({ cidVersion: 1 });

        const parts: Buffer[] = [];
        parts.push(
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="pinataMetadata"\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n`,
            ),
        );
        parts.push(
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="pinataOptions"\r\nContent-Type: application/json\r\n\r\n${optsJson}\r\n`,
            ),
        );
        parts.push(
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${fileName}"\r\nContent-Type: image/png\r\n\r\n`,
            ),
        );
        parts.push(fileBuffer);
        parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

        const totalLength = parts.reduce((acc, b) => acc + b.length, 0);

        const req = https.request(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            {
                method: 'POST',
                family: 4,
                headers: {
                    ...authHeaders,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': totalLength,
                },
            },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        const json = JSON.parse(data) as PinataPinResponse;
                        resolve(json.IpfsHash);
                    } else {
                        reject(new Error(`Failed to pin file (${res.statusCode}): ${data}`));
                    }
                });
            },
        );

        req.on('error', reject);
        for (const p of parts) {
            req.write(p);
        }
        req.end();
    });
}

function pinDirectoryToPinata(
    files: Array<{ relativePath: string; content: string }>,
    folderName: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        const boundary = '----WebKitFormBoundary' + crypto.randomBytes(16).toString('hex');
        const authHeaders = getAuthHeaders();

        const metaJson = JSON.stringify({ name: folderName });
        const optsJson = JSON.stringify({ cidVersion: 1 });

        const parts: Buffer[] = [];
        parts.push(
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="pinataMetadata"\r\nContent-Type: application/json\r\n\r\n${metaJson}\r\n`,
            ),
        );
        parts.push(
            Buffer.from(
                `--${boundary}\r\nContent-Disposition: form-data; name="pinataOptions"\r\nContent-Type: application/json\r\n\r\n${optsJson}\r\n`,
            ),
        );

        for (const f of files) {
            const fileBuf = Buffer.from(f.content, 'utf-8');
            parts.push(
                Buffer.from(
                    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${folderName}/${f.relativePath}"\r\nContent-Type: application/json\r\n\r\n`,
                ),
            );
            parts.push(fileBuf);
            parts.push(Buffer.from('\r\n'));
        }

        parts.push(Buffer.from(`--${boundary}--\r\n`));
        const totalLength = parts.reduce((acc, b) => acc + b.length, 0);

        const req = https.request(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            {
                method: 'POST',
                family: 4,
                headers: {
                    ...authHeaders,
                    'Content-Type': `multipart/form-data; boundary=${boundary}`,
                    'Content-Length': totalLength,
                },
            },
            (res) => {
                let data = '';
                res.on('data', (c) => (data += c));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        const json = JSON.parse(data) as PinataPinResponse;
                        resolve(json.IpfsHash);
                    } else {
                        reject(new Error(`Failed to pin directory (${res.statusCode}): ${data}`));
                    }
                });
            },
        );

        req.on('error', reject);
        for (const p of parts) {
            req.write(p);
        }
        req.end();
    });
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

function updateMetadataFiles(artworkCid: string) {
    const imageUri = `ipfs://${artworkCid}`;

    // Update Founder item metadata
    const founderData = JSON.parse(fs.readFileSync(founderMetadataFile, 'utf-8'));
    founderData.image = imageUri;
    founderData.content_url = imageUri;
    fs.writeFileSync(founderMetadataFile, JSON.stringify(founderData, null, 2) + '\n', 'utf-8');

    // Update Collection metadata
    const collectionData = JSON.parse(fs.readFileSync(collectionMetadataFile, 'utf-8'));
    collectionData.image = imageUri;
    if (collectionData.cover_image && collectionData.cover_image.startsWith('<PLACEHOLDER')) {
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
        updateMetadataFiles(artworkCid);

        if (metadataFolderCid) {
            console.log(`Applying metadata folder CID: ${metadataFolderCid}`);
            updateEnvFile({
                COLLECTION_METADATA_URI: `ipfs://${metadataFolderCid}/collection.json`,
                COMMON_CONTENT_BASE_URI: `ipfs://${metadataFolderCid}/`,
                FOUNDER_METADATA_URI: 'velvet-gremlin-000-founder.json',
            });
        }
        console.log('\n✅ CIDs successfully updated across project!');
        return;
    }

    const hasCreds =
        (process.env.PINATA_API_KEY && process.env.PINATA_API_SECRET) || process.env.PINATA_JWT;

    if (!hasCreds) {
        console.log('\n[INFO] No Pinata credentials found in environment or .env file.');
        return;
    }

    // 2. Automated Pinata Pinning
    console.log('\n[2/3] Authenticating with Pinata...');
    const authRes = await testPinataAuth();
    console.log(`   ${authRes.message}`);

    console.log('\n[3/3] Pinning assets to IPFS via Pinata API...');

    // Step A: Pin Master Transparent Artwork
    console.log('1. Uploading velvet-gremlin-000-founder.png (2.78 MB)...');
    const artworkCid = await pinFileToPinata(
        collectionArtworkFile,
        'velvet-gremlin-000-founder.png',
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
            content: fs.readFileSync(collectionMetadataFile, 'utf-8'),
        },
        {
            relativePath: 'velvet-gremlin-000-founder.json',
            content: fs.readFileSync(founderMetadataFile, 'utf-8'),
        },
    ];

    const metadataFolderCid = await pinDirectoryToPinata(
        metadataFiles,
        'velvet-gremlins-metadata',
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
