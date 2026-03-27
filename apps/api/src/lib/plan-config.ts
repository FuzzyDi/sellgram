import prisma from './prisma.js';
import getRedis from './redis.js';
import { PLANS, type PlanCode } from '@sellgram/shared';

const CACHE_KEY = 'sellgram:plan_configs';
const CACHE_TTL = 300; // 5 minutes

export type PlanLimitsOverride = Partial<typeof PLANS[PlanCode]['limits']>;

export type PlanConfig = {
  code: PlanCode;
  name: string;
  price: number;
  limits: typeof PLANS[PlanCode]['limits'];
};

function defaultConfigs(): Record<PlanCode, PlanConfig> {
  return Object.fromEntries(
    (Object.keys(PLANS) as PlanCode[]).map((code) => [
      code,
      {
        code,
        name: (PLANS[code] as any).name as string,
        price: (PLANS[code] as any).price as number,
        limits: { ...(PLANS[code] as any).limits },
      } as PlanConfig,
    ])
  ) as Record<PlanCode, PlanConfig>;
}

export async function getAllPlanConfigs(): Promise<Record<PlanCode, PlanConfig>> {
  const redis = getRedis();

  try {
    const cached = await redis.get(CACHE_KEY);
    if (cached) return JSON.parse(cached) as Record<PlanCode, PlanConfig>;
  } catch {
    // Redis failure is non-fatal
  }

  const configs = defaultConfigs();

  const settings = await prisma.systemSetting.findMany({
    where: { key: { startsWith: 'plan_config:' } },
  });

  for (const setting of settings) {
    const code = setting.key.replace('plan_config:', '') as PlanCode;
    if (configs[code] && setting.value && typeof setting.value === 'object') {
      const v = setting.value as any;
      if (typeof v.price === 'number') configs[code].price = v.price;
      if (v.limits && typeof v.limits === 'object') {
        configs[code].limits = { ...configs[code].limits, ...v.limits } as any;
      }
    }
  }

  try {
    await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(configs));
  } catch {
    // non-fatal
  }

  return configs;
}

export async function getPlanConfig(code: PlanCode): Promise<PlanConfig> {
  const configs = await getAllPlanConfigs();
  return configs[code] ?? defaultConfigs()[code];
}

export async function updatePlanConfig(
  code: PlanCode,
  patch: { price?: number; limits?: PlanLimitsOverride },
): Promise<PlanConfig> {
  const configs = await getAllPlanConfigs();
  const current = configs[code];

  const newPrice = patch.price !== undefined ? patch.price : current.price;
  const newLimits = patch.limits ? { ...current.limits, ...patch.limits } : current.limits;

  const storedValue = { price: newPrice, limits: newLimits };

  await prisma.systemSetting.upsert({
    where: { key: `plan_config:${code}` },
    create: { key: `plan_config:${code}`, value: storedValue as any },
    update: { value: storedValue as any },
  });

  // Invalidate cache
  try {
    await getRedis().del(CACHE_KEY);
  } catch {
    // non-fatal
  }

  return { code, name: current.name, price: newPrice, limits: newLimits as any };
}
