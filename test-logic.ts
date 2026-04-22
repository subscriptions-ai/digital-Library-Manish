const content = { domain: "Medical", contentType: "Books" };
const activeSubscriptions = [
  {
    planName: 'Medical Sciences Plan',
    domains: [ 'Medical Sciences' ],
    contentTypes: [ 'Books' ],
    domainName: null
  }
];

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

console.log("Access?", checkContentAccess(content, "Subscriber", activeSubscriptions));
