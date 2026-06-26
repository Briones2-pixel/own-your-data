/**
 * Send the Cloudbound Intel digest email via Resend.
 *
 * Env:
 *   RESEND_API_KEY  - Resend API key (https://resend.com — free tier works)
 *   EMAIL_TO        - recipient (e.g. brionesgerardo@gmail.com)
 *   EMAIL_FROM      - sender; defaults to Resend's shared onboarding sender
 *   EMAIL_SUBJECT   - optional subject override
 *
 * Usage: node scripts/send-email.js <html-file>
 *
 * Degrades gracefully: if RESEND_API_KEY / EMAIL_TO are missing it prints
 * setup guidance and exits 0 so the workflow still succeeds.
 */

const fs = require('fs');

async function main() {
    const file = process.argv[2];
    if (!file || !fs.existsSync(file)) {
        console.error(`❌ Email body not found: ${file}`);
        process.exit(1);
    }
    const html = fs.readFileSync(file, 'utf-8');

    const key = process.env.RESEND_API_KEY;
    const to = process.env.EMAIL_TO;
    const from = process.env.EMAIL_FROM || 'Cloudbound Intel <onboarding@resend.dev>';
    const subject = process.env.EMAIL_SUBJECT || `Cloudbound FEC Intel — ${new Date().toISOString().split('T')[0]}`;

    if (!key || !to) {
        console.log('ℹ️  Email not configured — skipping send.');
        console.log('   Add repo secrets to enable it:');
        console.log('     • RESEND_API_KEY  (free key from https://resend.com)');
        console.log('     • EMAIL_TO        (your address)');
        console.log('   Optional: EMAIL_FROM (a verified sender on your domain).');
        process.exit(0);
    }

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], subject, html }),
    });

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`⚠️ Resend returned HTTP ${res.status}: ${body.slice(0, 300)}`);
        process.exit(0); // never fail the whole workflow on a delivery hiccup
    }
    const data = await res.json().catch(() => ({}));
    console.log(`✅ Email sent to ${to} (id: ${data.id || 'n/a'})`);
}

main().catch((e) => {
    console.error('⚠️ Email error:', e.message);
    process.exit(0);
});
