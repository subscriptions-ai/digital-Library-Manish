/**
 * The assistant's pre-chat rules (src/lib/visitorDetails.ts) — the same module the form and the server use. No server, no database.
 *
 *   npx tsx scripts/test-visitor-details.ts
 */
import { validateVisitor, normalisePhone, isValidEmail, VISITOR_MESSAGES as M } from '../src/lib/visitorDetails.ts';

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};
const run = (name: unknown, email: unknown, phone: unknown) => validateVisitor({ name, email, phone });
const errs = (r: ReturnType<typeof validateVisitor>) => ('errors' in r ? r.errors : {});

// The brief's examples.
{
  const r = run('Rajesh Kumar', 'rajesh@gmail.com', '');
  check('name + email passes', r.ok && 'value' in r && r.value.email === 'rajesh@gmail.com' && r.value.phone === '');
}
{
  const r = run('Rajesh Kumar', '', '9810078958');
  check('name + mobile passes', r.ok && 'value' in r && r.value.phone === '9810078958');
}
{
  const r = run('Rajesh Kumar', 'rajesh@university.ac.in', '+91 98100 78958');
  check('name + email + +91 mobile passes, phone normalised', r.ok && 'value' in r && r.value.phone === '9810078958', JSON.stringify(r));
}
check('invalid email blocks', errs(run('Rajesh', 'rajesh', '')).email === M.email);
check('invalid mobile 1234567890 blocks', errs(run('Rajesh', '', '1234567890')).phone === M.phone);
check('blank name blocks', errs(run('', 'rajesh@gmail.com', '')).name === M.nameRequired);
check('name only blocks with the either/or message', errs(run('Rajesh Kumar', '', '')).contact === M.contact);
check('spaces-only name blocks', errs(run('    ', 'a@b.co', '')).name === M.nameRequired);
check('invalid email + valid phone still blocks on email', errs(run('Rajesh', 'abc@', '9810078958')).email === M.email);
check('valid email + invalid phone text still blocks on phone', errs(run('Rajesh', 'a@b.co', '98100abcde')).phone === M.phone);

// Name.
for (const n of ['Rajesh Kumar', "D'Souza", 'Mary-Jane O’Neil', 'Dr. A. Sharma', 'José Álvarez', 'राजेश कुमार', 'Al'])
  check(`name accepted: ${n}`, !errs(run(n, 'a@b.co', '')).name);
for (const [n, why] of [['R', M.nameShort], ['R.', M.nameShort], ['Rajesh123', M.nameChars], ['<b>x</b>', M.nameChars], ['-Raj', M.nameChars], ['x'.repeat(101), M.nameLong]] as const)
  check(`name refused: ${n.slice(0, 20)}`, errs(run(n, 'a@b.co', '')).name === why);
{
  const r = run('  Rajesh    Kumar  ', 'a@b.co', '');
  check('name trimmed and spaces collapsed', 'value' in r && r.value.name === 'Rajesh Kumar');
}

// Email.
for (const e of ['name@example.com', 'researcher@university.edu', 'user.name+tag@example.co.in', ' Name@Example.COM '])
  check(`email accepted: ${e}`, !errs(run('Rajesh', e, '')).email);
for (const e of ['abc', 'abc@', '@gmail.com', 'name@domain', 'na me@example.com', 'name@exa mple.com', '.name@example.com', 'name.@example.com', 'na..me@example.com', 'name@-example.com', `${'a'.repeat(65)}@example.com`])
  check(`email refused: ${e}`, errs(run('Rajesh', e, '')).email === M.email);
{
  const r = run('Rajesh', '  Rajesh@Gmail.COM ', '');
  check('email trimmed and lower-cased', 'value' in r && r.value.email === 'rajesh@gmail.com');
}
check('email length cap 254', !isValidEmail(`a@${'b'.repeat(250)}.com`));

// Phone.
for (const [raw, want] of [['9810078958', '9810078958'], ['+91 98100 78958', '9810078958'], ['+91-98100-78958', '9810078958'], ['98100 78958', '9810078958'],
  ['919810078958', '9810078958'], ['(+91) 98100-78958', '9810078958'], ['00919810078958', '9810078958'], ['09810078958', '9810078958'], ['6000000000', '6000000000']] as const) {
  const r = run('Rajesh', '', raw);
  check(`phone accepted: "${raw}" -> ${want}`, 'value' in r && r.value.phone === want, JSON.stringify(r));
}
for (const raw of ['1234567890', '5810078958', '98100', '98100abcde', '+1 415 555 0100', '+9198100789581', '98100789588', '+91', '9810078958.'])
  check(`phone refused: "${raw}"`, errs(run('Rajesh', '', raw)).phone === M.phone, `normalised=${normalisePhone(raw)}`);

// Non-string input (a hand-made request) is treated as blank, never thrown on.
check('non-string fields do not throw', errs(run({ x: 1 }, ['a@b.co'], 9810078958)).name === M.nameRequired);

console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
