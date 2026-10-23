/**
 * Writes the quotation email to a file so it can be opened in a browser or sent to a mailbox for a look.
 *
 *   npx tsx scripts/preview-quotation-email.ts /tmp/quotation-email.html [--discount=4000] [--departments=3]
 *
 * The logo is embedded in the file so it shows in a browser (the real email attaches it and refers to it as cid:stm-logo).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildQuotationEmailHtml } from '../src/lib/quotation/quotationEmail';
import { DOMAINS } from '../src/constants';

const out = process.argv[2];
if (!out) { console.error('Usage: npx tsx scripts/preview-quotation-email.ts <output.html> [--discount=N] [--departments=N]'); process.exit(1); }
const arg = (k: string) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1];
const count = Number(arg('departments') ?? 14);
const html = buildQuotationEmailHtml({
  hasLogo: true, recipientName: 'Marketing', quotationNumber: 'ITB/SDL/26-27/002', issuedDate: '23 Oct 2026', validityDays: 15, duration: 'Annual',
  departments: DOMAINS.slice(0, count).map((d: any) => d.name), discount: Number(arg('discount') ?? 0), total: 94282,
}).replace('src="cid:stm-logo"', `src="data:image/png;base64,${readFileSync(new URL('../public/assets/stm-logo.png', import.meta.url)).toString('base64')}"`);
writeFileSync(out, html);
console.log(`wrote ${out} (${html.length} bytes)`);
