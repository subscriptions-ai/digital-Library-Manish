import type { PrismaClient } from '@prisma/client';

/**
 * The master switch for the public AI assistant. The server is the only authority: the page asks, and the chat route
 * checks the same value before it does anything, so hiding the button is a courtesy and this is the lock.
 *
 * Stored in AppSetting (key AI_ASSISTANT_ENABLED), so it survives restarts and redeploys and can be changed without
 * either. No row means it has never been switched, which means enabled — deploying this changes nothing by itself.
 *
 * Reads are cached briefly so a busy site does not query on every request; turning it off in this process takes
 * effect at once, and in any other process within the TTL. If the value cannot be read the answer is "off": a switch
 * that cannot be read must not leave a paid model reachable.
 */
export const AI_SETTING_KEY = 'AI_ASSISTANT_ENABLED';
export const AI_CACHE_TTL_MS = 30_000;
/** How long an unreadable answer is remembered, so a database outage is not hit on every request. */
const ERROR_TTL_MS = 5_000;

export const DISABLED_BODY = { code: 'AI_ASSISTANT_DISABLED', message: 'AI Assistant is temporarily unavailable.' } as const;

let cached: { enabled: boolean; until: number } | null = null;
export const __resetAiSwitchCache = () => { cached = null; };

export async function aiAssistantEnabled(prisma: PrismaClient, now = Date.now()): Promise<boolean> {
  if (cached && cached.until > now) return cached.enabled;
  try {
    const row = await prisma.appSetting.findUnique({ where: { key: AI_SETTING_KEY } });
    const enabled = !row || (row.value as any)?.enabled !== false;
    cached = { enabled, until: now + AI_CACHE_TTL_MS };
    return enabled;
  } catch (e: any) {
    console.error('AI switch read failed (treating the assistant as off):', e?.message);
    cached = { enabled: false, until: now + ERROR_TTL_MS };
    return false;
  }
}

/** What the admin screen shows: the switch, and who last moved it. Never cached. */
export async function aiAssistantSwitchState(prisma: PrismaClient) {
  const row = await prisma.appSetting.findUnique({ where: { key: AI_SETTING_KEY } });
  return {
    enabled: !row || (row.value as any)?.enabled !== false,
    everChanged: !!row,
    changedAt: row ? row.updatedAt.toISOString() : null,
    changedBy: row?.updatedBy ?? null,
  };
}

/** Flip the switch and write the audit row together: both happen or neither does. */
export async function setAiAssistantEnabled(prisma: PrismaClient, enabled: boolean, admin: { id?: string | null; email?: string | null }) {
  const by = admin.email || admin.id || null;
  await prisma.$transaction([
    prisma.appSetting.upsert({
      where: { key: AI_SETTING_KEY },
      create: { key: AI_SETTING_KEY, value: { enabled }, updatedBy: by },
      update: { value: { enabled }, updatedBy: by },
    }),
    prisma.adminAuditLog.create({
      data: { adminId: admin.id ?? null, adminEmail: admin.email ?? null, action: enabled ? 'AI_ASSISTANT_ENABLED' : 'AI_ASSISTANT_DISABLED', meta: { setting: AI_SETTING_KEY } },
    }),
  ]);
  cached = { enabled, until: Date.now() + AI_CACHE_TTL_MS };
  return aiAssistantSwitchState(prisma);
}

/** Recent changes to the switch, newest first. */
export async function aiAssistantSwitchHistory(prisma: PrismaClient, take = 10) {
  const rows = await prisma.adminAuditLog.findMany({
    where: { action: { in: ['AI_ASSISTANT_ENABLED', 'AI_ASSISTANT_DISABLED'] } }, orderBy: { at: 'desc' }, take,
  });
  return rows.map(r => ({ at: r.at.toISOString(), action: r.action, by: r.adminEmail || r.adminId || null }));
}
