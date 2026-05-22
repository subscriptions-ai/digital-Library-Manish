import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function run() {
  const user = await prisma.user.findUnique({ where: { email: 'shubham@gmail.com' }});
  if (!user) return console.log("User not found");

  const activeSubscriptions = await prisma.subscription.findMany({
    where: {
      OR: [{ userId: user.id }, { institutionId: user.institutionId || undefined }],
      status: 'Active',
      endDate: { gt: new Date() }
    }
  });

  const checkContentAccess = (content: any, userRole: string, activeSubscriptions: any[]) => {
    if (userRole === 'SuperAdmin' || userRole === 'Admin' || userRole === 'ContentManager') return true;
    
    return activeSubscriptions.some(sub => {
      const d: string[] = Array.isArray(sub.domains) ? sub.domains as string[] : (sub.domains ? JSON.parse(sub.domains as string) : []);
      const safeContentDomain = content.domain ? content.domain.toLowerCase() : "";
      
      const domainMatch = d.some(subDomain => {
        if (!subDomain) return false;
        const safeSub = subDomain.toLowerCase();
        return safeSub.includes(safeContentDomain) || safeContentDomain.includes(safeSub);
      }) || (sub.domainName && (
        sub.domainName.toLowerCase().includes(safeContentDomain) || 
        safeContentDomain.includes(sub.domainName.toLowerCase())
      ));

      if (!domainMatch) return false;

      const ct: string[] = Array.isArray(sub.contentTypes) ? sub.contentTypes as string[] : (sub.contentTypes ? JSON.parse(sub.contentTypes as string) : []);
      if (ct.length === 0) return true;
      return ct.includes(content.contentType);
    });
  };

  const allModules = await prisma.contentModule.findMany({ where: { isActive: true } });
  
  const uniqueModulesMap = new Map();
  allModules.forEach(mod => {
    const key = `${mod.domain}_${mod.contentType}`;
    if (!uniqueModulesMap.has(key) || mod.totalCount > uniqueModulesMap.get(key).totalCount) {
      uniqueModulesMap.set(key, mod);
    }
  });
  const uniqueModules = Array.from(uniqueModulesMap.values());

  const accessMap = uniqueModules.map(mod => {
    const mockContent = { domain: mod.domain, contentType: mod.contentType };
    return {
      domain: mod.domain,
      contentType: mod.contentType,
      hasAccess: checkContentAccess(mockContent, user.role, activeSubscriptions)
    };
  });
  
  console.log(accessMap);
}
run();
