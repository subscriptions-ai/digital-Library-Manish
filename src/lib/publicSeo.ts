/** Shared by the browser metadata and HTTP middleware. */
export const PUBLIC_REDIRECTS: Record<string, string> = {
  '/subscriptions': '/for-institutions',
  '/for-researchers': '/for-students',
  '/departments': '/digital-library#departments',
  '/home-preview': '/',
  '/home-classic': '/',
  '/journals': '/digital-library',
};

export const PUBLIC_PAGES: Record<string, [string, string]> = {
  '/': ['Academic Discovery', 'Discover academic resources by department, subject, and source on STM Digital Library.'],
  '/about': ['About Us', 'Learn about STM Digital Library, its operator, mission, and approach to academic discovery.'],
  '/digital-library': ['Digital Library', 'Explore academic journals, articles, books, and other resources by department.'],
  '/for-institutions': ['For Institutions', 'Explore institutional subscriptions, library management, and academic access.'],
  '/for-students': ['For Students & Researchers', 'Explore academic resources and individual access options for students and researchers.'],
  '/institutions': ['Institutional Community', 'Explore institutions represented in the STM Digital Library community.'],
  '/institutional-access': ['Institutional Access', 'Find out how your institution can access STM Digital Library.'],
  '/contact': ['Contact Us', 'Contact STM Digital Library for support, institutional enquiries, and privacy requests.'],
  '/faq': ['Frequently Asked Questions', 'Find answers about library access, accounts, and subscriptions.'],
  '/blog': ['Blog', 'Published updates and articles from STM Digital Library.'],
  '/content-sources': ['Content Sources & Licensing', 'Learn about content sources, access information, and licensing on STM Digital Library.'],
  '/privacy-policy': ['Privacy Policy', 'Read how STM Digital Library handles personal information and privacy requests.'],
  '/terms-and-conditions': ['Terms & Conditions', 'Read the terms that apply to use of STM Digital Library.'],
  '/legal-disclaimer': ['Legal Disclaimer', 'Read the limitations and third-party content disclaimer for STM Digital Library.'],
  '/content-removal': ['Content Removal', 'Report rights or content concerns through the STM Digital Library review process.'],
};

export function isPrivatePage(path: string) {
  return /^\/(admin|sales|institution|dashboard|manager|publisher|studio|validator|login|signup|unsubscribe|payment|payments)(\/|$)/.test(path);
}
