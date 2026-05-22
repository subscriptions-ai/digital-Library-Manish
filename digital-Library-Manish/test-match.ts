const content = { domain: "Medical" };
const sub = { domains: ["Medical Sciences"], domainName: null };

const d = sub.domains;
const safeContentDomain = content.domain ? content.domain.toLowerCase() : "";

const domainMatch = d.some(subDomain => {
  if (!subDomain) return false;
  const safeSub = subDomain.toLowerCase();
  return safeSub.includes(safeContentDomain) || safeContentDomain.includes(safeSub);
});
console.log("Match:", domainMatch);
