/**
 * Every department's hero photograph: its own picture, actually on disk, credited where the licence asks for it.
 * The four departments added on 2026-10-30 all pointed at the Medical Sciences photograph, so four pages showed one image.
 *   npx tsx scripts/test-department-hero-images.ts
 */
import assert from 'node:assert/strict';
import { existsSync, statSync } from 'node:fs';
import { HERO_IMAGES, HERO_CREDITS, HERO_ALT } from '../src/lib/departmentHero.js';
import { CANONICAL_DEPARTMENTS } from '../src/lib/departmentRegistry.js';

let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; console.log('  PASS ', name); };
const local = (u: string) => u.startsWith('/');
const NEW_FOUR = ['paramedical-sciences', 'radiology', 'medical-laboratory-technology', 'optometry-ophthalmology'];

t('no two departments share one photograph', () => {
  const byUrl = new Map<string, string[]>();
  for (const [id, url] of Object.entries(HERO_IMAGES)) byUrl.set(url, [...(byUrl.get(url) ?? []), id]);
  const shared = [...byUrl.entries()].filter(([, ids]) => ids.length > 1).map(([url, ids]) => `${ids.join(' + ')} -> ${url}`);
  assert.deepEqual(shared, [], 'these departments show the same image');
});

t('the four departments added on 2026-10-30 each have their own self-hosted photograph', () => {
  for (const id of NEW_FOUR) {
    assert.ok(HERO_IMAGES[id], `${id} has no hero image`);
    assert.ok(local(HERO_IMAGES[id]), `${id} should be served by us, not hotlinked`);
  }
});

t('every self-hosted photograph is really in public/, is a readable size, and is reachable at the path the page asks for', () => {
  for (const [id, url] of Object.entries(HERO_IMAGES)) {
    if (!local(url)) continue;
    const file = new URL(`../public${url}`, import.meta.url);
    assert.ok(existsSync(file), `${id}: ${url} is not in public/`);
    const { size } = statSync(file);
    assert.ok(size > 20_000, `${id}: ${url} is only ${size} bytes`);
    assert.ok(size < 400_000, `${id}: ${url} is ${Math.round(size / 1024)} KB — too heavy for a page header`);
  }
});

t('every self-hosted photograph is credited and described', () => {
  for (const [id, url] of Object.entries(HERO_IMAGES)) {
    if (!local(url)) continue;
    const c = HERO_CREDITS[id];
    assert.ok(c, `${id} has no credit`);
    assert.ok(c.author.trim(), `${id} credit has no author`);
    assert.ok(/^https:\/\//.test(c.source), `${id} credit has no source link`);
    assert.ok(HERO_ALT[id]?.trim(), `${id} has no alt text`);
    if (c.attributionRequired) assert.ok(/^https:\/\//.test(c.licenceUrl), `${id} requires attribution, so it needs the licence link`);
  }
});

t('a licence that needs attribution is marked as needing it', () => {
  for (const [id, c] of Object.entries(HERO_CREDITS)) {
    const needs = /^cc by/i.test(c.licence);
    assert.equal(c.attributionRequired, needs, `${id}: licence "${c.licence}" and attributionRequired disagree`);
  }
});

t('every credit belongs to a department the registry knows', () => {
  const ids = new Set(CANONICAL_DEPARTMENTS.map(d => d.id));
  for (const id of Object.keys(HERO_CREDITS)) assert.ok(ids.has(id), `${id} is not a department`);
});

console.log(`\n${n} passed`);
