/**
 * Upload a file to Google Drive using a service account.
 * Used by the weekly FEC digest workflow.
 *
 * Env:
 *   GDRIVE_SERVICE_ACCOUNT  - JSON key of a Google service account (string)
 *   GDRIVE_FOLDER_ID        - target Drive folder ID (the SA must have edit
 *                             access — share the folder with the SA's email)
 *   GDRIVE_CONVERT_TO_DOC   - "1" to convert an uploaded .html into a Google Doc
 *
 * Usage: node scripts/upload-to-drive.js <filepath> ["Display Name"]
 *
 * Degrades gracefully: if the secret/folder aren't configured it prints setup
 * instructions and exits 0, so the workflow still succeeds (the digest is also
 * attached as a build artifact + committed to the repo).
 */

const fs = require('fs');
const path = require('path');

async function main() {
    const filePath = process.argv[2];
    const displayName = process.argv[3] || (filePath ? path.basename(filePath) : '');

    if (!filePath || !fs.existsSync(filePath)) {
        console.error(`❌ File not found: ${filePath}`);
        process.exit(1);
    }

    const saRaw = process.env.GDRIVE_SERVICE_ACCOUNT;
    const folderId = process.env.GDRIVE_FOLDER_ID;

    if (!saRaw || !folderId) {
        console.log('ℹ️  Google Drive delivery not configured — skipping upload.');
        console.log('   To enable weekly delivery to your Drive, add two repo secrets:');
        console.log('     • GDRIVE_SERVICE_ACCOUNT = the full JSON key of a Google service account');
        console.log('     • GDRIVE_FOLDER_ID       = the target Drive folder ID');
        console.log('   Then share that Drive folder (Editor) with the service account email.');
        console.log(`   (Digest is still available as a workflow artifact: ${path.basename(filePath)})`);
        process.exit(0);
    }

    let google;
    try {
        ({ google } = require('googleapis'));
    } catch {
        console.log('⚠️ googleapis not installed; skipping Drive upload (artifact still produced).');
        process.exit(0);
    }

    const creds = JSON.parse(saRaw);
    const auth = new google.auth.GoogleAuth({
        credentials: creds,
        scopes: ['https://www.googleapis.com/auth/drive.file'],
    });
    const drive = google.drive({ version: 'v3', auth });

    const ext = path.extname(filePath).toLowerCase();
    const sourceMime = ext === '.pdf' ? 'application/pdf' : ext === '.html' ? 'text/html' : 'application/octet-stream';
    const convert = process.env.GDRIVE_CONVERT_TO_DOC === '1' && ext === '.html';

    const requestBody = { name: displayName, parents: [folderId] };
    if (convert) requestBody.mimeType = 'application/vnd.google-apps.document';

    const res = await drive.files.create({
        requestBody,
        media: { mimeType: sourceMime, body: fs.createReadStream(filePath) },
        fields: 'id, webViewLink, name',
        supportsAllDrives: true,
    });

    console.log(`✅ Uploaded to Drive: ${res.data.name}`);
    console.log(`   ${res.data.webViewLink || res.data.id}`);
}

main().catch((e) => {
    // Never fail the whole workflow on a delivery hiccup — log and move on.
    console.error('⚠️ Drive upload error:', e.message);
    process.exit(0);
});
