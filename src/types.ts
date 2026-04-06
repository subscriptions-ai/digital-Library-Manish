export type UserRole = 
  | 'SuperAdmin'
  | 'Institution'
  | 'Student'
  | 'SubscriptionManager'
  | 'Admin' 
  | 'Subscriber'
  | 'ContentManager' 
  | 'Agency' 
  | 'College' 
  | 'University' 
  | 'Corporate';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
  institutionId?: string;
  subscriptionId?: string;
  organization?: string;
  status: 'Active' | 'Inactive';
  createdAt: any;
  updatedAt: any;
}

export interface Institution {
  id: string;
  name: string;
  adminUid: string;
  type: 'College' | 'University' | 'Corporate';
  maxSubUsers: number;
  currentSubUsers: number;
  subscriptionId?: string;
  createdAt: any;
}

export interface Subscription {
  id: string;
  userId?: string;
  institutionId?: string;
  planId: string;
  planName: string;
  startDate: any;
  expiryDate: any;
  status: 'Active' | 'Expired' | 'Pending';
  usageLimits: {
    views: number;
    downloads: number;
  };
  usageStats: {
    views: number;
    downloads: number;
  };
}

export interface UsageLog {
  id: string;
  userId: string;
  userEmail: string;
  institutionId?: string;
  contentId: string;
  contentTitle: string;
  action: 'View' | 'Download';
  timestamp: any;
}

export interface ContentTypeInfo {
  type: string;
  count: string;
  description: string;
}

export interface ContentType {
  id: string;
  name: string;
  icon: string;
  description: string;
}

export type Domain = {
  id: string;
  name: string;
  description: string;
  importance: string;
  contentAvailable: string[];
  contentTypes: ContentTypeInfo[];
  whySubscribe: string;
  whoShouldSubscribe: string[];
  features: string[];
  icon: string;
  themeColor: string;
};

export type Journal = {
  id: string;
  title: string;
  domainId: string;
  issn: string;
  impactFactor: number;
  description: string;
  coverImage: string;
  frequency: string;
  publisher: string;
};

export type PricingTier = {
  duration: 'Monthly' | 'Quarterly' | 'Half-Yearly' | 'Yearly';
  price: number;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  userType: 'Student' | 'College' | 'University' | 'Corporate';
  description: string;
  features: string[];
  pricing: PricingTier[];
};

export type SubmissionStatus = 'Pending' | 'Approved' | 'Rejected';
export type PublishingMode = 'Subscription' | 'OpenAccess';
export type PaymentStatus = 'Pending' | 'Paid' | 'N/A';

export interface Submission {
  submissionId: string;
  userId: string;
  title: string;
  authors: string;
  institution?: string;
  contentType: string;
  subjectArea?: string;
  abstract?: string;
  keywords?: string;
  publicationYear?: number;
  fileUrl: string;
  coverImageUrl?: string;
  publishingMode: PublishingMode;
  paymentStatus: PaymentStatus;
  status: SubmissionStatus;
  createdAt: any;
  updatedAt: any;
}

export interface PublishedContent {
  contentId: string;
  submissionId: string;
  title: string;
  authors: string;
  contentType: string;
  subjectArea?: string;
  fileUrl: string;
  publishingMode: string;
  publishedAt: any;
}
