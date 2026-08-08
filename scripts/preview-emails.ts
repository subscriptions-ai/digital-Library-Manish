/**
 * Renders every transactional email to dist-email-preview/ so the designs can
 * be opened in a browser and checked before they go anywhere near a customer.
 *
 *   npx tsx scripts/preview-emails.ts
 *
 * The bodies here mirror the ones in server.ts. When you change an email there,
 * change it here too — this file is the only way to see the result.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  MAIL_BASE, esc, escLines, buildEmail,
  eBody, eH1, eP, eMuted, eBtn, eCard, eRows, eQuote,
} from '../src/lib/emailTemplates.js';

const pub = { name: 'Frontiers Media SA' };
const ag = { title: 'Content Partnership & Tie-Up Agreement — Frontiers Media SA', version: '1.0', documentUrl: null as string | null };
const now = new Date().toLocaleString('en-IN');

const samples: { file: string; subject: string; html: string }[] = [
  {
    file: '1-invitation.html',
    subject: 'Partnership Invitation & Login — STM Digital Library',
    html: buildEmail(eBody(
      eH1(`You're invited to partner with STM Digital Library`) +
      eP(`Dear ${esc(pub.name)},`) +
      eP(`We would be glad to have ${esc(pub.name)} on STM Digital Library. Sharing your open-access content puts your journals in front of the institutions and researchers already searching our platform — which means more readership, and more citations.`) +
      eP(`Your publisher account is ready:`) +
      eRows([
        ['Login email', 'rights@frontiersin.org'],
        ['Temporary password', `<span style="font-family:Consolas,Menlo,monospace;font-size:15px;font-weight:700;letter-spacing:0.5px;color:#1e3a6e;">Xk7-pQ2m-9Tr</span>`],
      ]) +
      eCard(`Please change this password the first time you sign in.`, 'warning') +
      eBtn('Sign in to your dashboard', `${MAIL_BASE}/publisher`) +
      eP(`From your dashboard you can submit and manage your catalogue, correct metadata, see readership analytics for your own titles, and withdraw any item at any time without going through us.`) +
      eMuted(`Have a question before you begin? Simply reply to this email — it reaches our team directly.`)
    ), `Your publisher account for ${pub.name} is ready`),
  },
  {
    file: '2-agreement-sent.html',
    subject: `Agreement for your signature — ${ag.title}`,
    html: buildEmail(eBody(
      eH1(`An agreement is ready for your signature`) +
      eP(`Dear ${esc(pub.name)},`) +
      eP(`We have prepared the agreement below for your review. You can read it in full, and sign or decline it, from your publisher dashboard — no printing, scanning or posting required.`) +
      eRows([
        ['Agreement', esc(ag.title)],
        ['Version', esc(ag.version)],
        ['Prepared for', esc(pub.name)],
      ]) +
      eBtn('Review &amp; sign the agreement', `${MAIL_BASE}/publisher`) +
      eCard(`Signing is entirely your choice. If anything in the agreement does not suit you, decline it and tell us why — we will revise it. You may also simply reply to this email.`, 'neutral') +
      eMuted(`This link opens your publisher dashboard. If you cannot sign in, reply to this email and we will help.`)
    ), `${ag.title} — ready for your review and signature`),
  },
  {
    file: '3-agreement-signed.html',
    subject: `✅ Agreement signed — ${pub.name}`,
    html: buildEmail(eBody(
      eH1(`${esc(pub.name)} signed the agreement`) +
      eCard(`<b>${esc(ag.title)}</b> was accepted and is now legally on record with a full audit trail.`, 'success') +
      eRows([
        ['Publisher', esc(pub.name)],
        ['Agreement', esc(ag.title)],
        ['Version', esc(ag.version)],
        ['Signed by', 'Dr. Anna Weiss'],
        ['Signer email', 'a.weiss@frontiersin.org'],
        ['Signature', 'Typed'],
        ['Signed at', esc(now)],
        ['IP address', '203.0.113.42'],
      ]) +
      eBtn('Open the publisher record', `${MAIL_BASE}/admin/publishers`)
    ), `${pub.name} accepted ${ag.title}`),
  },
  {
    file: '4-agreement-declined.html',
    subject: `Agreement declined — ${pub.name}`,
    html: buildEmail(eBody(
      eH1(`${esc(pub.name)} declined the agreement`) +
      eRows([
        ['Publisher', esc(pub.name)],
        ['Agreement', esc(ag.title)],
        ['Version', esc(ag.version)],
        ['Declined at', esc(now)],
      ]) +
      eCard(`<b>Reason given</b><br/>${escLines('Clause 3.2 needs to be limited to our OA titles only.\nHappy to sign a revised version.')}`, 'warning') +
      eP(`Nothing further happens automatically. You can revise the terms and send a fresh agreement whenever you are ready.`) +
      eBtn('Open the publisher record', `${MAIL_BASE}/admin/publishers`)
    ), `${pub.name} declined ${ag.title}`),
  },
  {
    file: '5-message-to-publisher.html',
    subject: 'New message from STM Digital Library',
    html: buildEmail(eBody(
      eH1(`You have a new message`) +
      eP(`Dear ${esc(pub.name)},`) +
      eP(`The STM Digital Library team has sent you a message on your publisher dashboard:`) +
      eQuote('STM Digital Library Team', 'Thank you for the updated title list.\n\nWe have indexed 42 of the 45 journals. The remaining three had no ISSN in the metadata — could you send those separately?') +
      eCard(`📎 A file is attached to this message in your dashboard.`, 'info') +
      eBtn('Read and reply', `${MAIL_BASE}/publisher`) +
      eMuted(`Replying in the dashboard keeps the whole conversation in one place.`)
    ), 'Thank you for the updated title list.'),
  },
  {
    file: '6-message-to-admin.html',
    subject: `New message from ${pub.name}`,
    html: buildEmail(eBody(
      eH1(`${esc(pub.name)} sent you a message`) +
      eQuote(pub.name, 'The three missing ISSNs are attached. Also — can we get analytics broken down by country?') +
      eCard(`📎 They attached a file — open the thread to download it.`, 'info') +
      eBtn('Open the conversation', `${MAIL_BASE}/admin/publishers`)
    ), `${pub.name}: The three missing ISSNs are attached.`),
  },
];

const outDir = path.join(process.cwd(), 'dist-email-preview');
fs.mkdirSync(outDir, { recursive: true });

for (const s of samples) {
  // The logo is a CID attachment at send time; swap in the real file for preview.
  fs.writeFileSync(path.join(outDir, s.file), s.html.replace(/cid:stm-logo-email/g, '/logo.png'));
  console.log(`  ${s.file.padEnd(30)} ${s.subject}`);
}

const index = `<!DOCTYPE html><meta charset="utf-8"><title>Email previews</title>` +
  `<body style="margin:0;background:#e2e8f0;font-family:'Segoe UI',Arial,sans-serif;">` +
  `<h1 style="padding:24px 32px 8px;margin:0;font-size:20px;color:#0f172a;">Transactional email previews</h1>` +
  `<p style="padding:0 32px 20px;margin:0;color:#475569;font-size:14px;">${samples.length} templates, rendered from src/lib/emailTemplates.ts</p>` +
  samples.map(s =>
    `<div style="padding:0 32px 28px;"><p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#1e3a6e;text-transform:uppercase;letter-spacing:0.5px;">${esc(s.subject)}</p>` +
    `<iframe src="${s.file}" style="width:100%;max-width:700px;height:720px;border:1px solid #cbd5e1;border-radius:10px;background:#fff;"></iframe></div>`
  ).join('') + `</body>`;
fs.writeFileSync(path.join(outDir, 'index.html'), index);

console.log(`\n${samples.length} emails written to ${outDir}\nOpen dist-email-preview/index.html to review them.`);
