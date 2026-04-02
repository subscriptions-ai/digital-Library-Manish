import { pgTable, text, timestamp, integer, uuid, jsonb, boolean, pgEnum } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const userRoleEnum = pgEnum('user_role', ['SuperAdmin', 'SubscriptionManager', 'ContentManager', 'Agency', 'Student', 'College', 'University', 'Corporate']);
export const userStatusEnum = pgEnum('user_status', ['Active', 'Inactive']);
export const subscriptionStatusEnum = pgEnum('subscription_status', ['Active', 'Expired', 'Pending']);
export const paymentStatusEnum = pgEnum('payment_status', ['Pending', 'Paid', 'Failed']);
export const submissionStatusEnum = pgEnum('submission_status', ['Pending', 'Approved', 'Rejected']);
export const publishModeEnum = pgEnum('publish_mode', ['Subscription', 'OpenAccess']);

export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: userRoleEnum('role').default('Student').notNull(),
  displayName: text('display_name'),
  institutionId: uuid('institution_id'), // Will add FK later if needed
  subscriptionId: uuid('subscription_id'),
  status: userStatusEnum('status').default('Active').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const institutions = pgTable('institutions', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  adminUid: uuid('admin_uid').notNull().references(() => users.id),
  type: text('type').notNull(), // 'College' | 'University' | 'Corporate'
  maxSubUsers: integer('max_sub_users').default(0).notNull(),
  currentSubUsers: integer('current_sub_users').default(0).notNull(),
  subscriptionId: uuid('subscription_id'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const subscriptions = pgTable('subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  institutionId: uuid('institution_id').references(() => institutions.id),
  planId: text('plan_id').notNull(),
  planName: text('plan_name').notNull(),
  startDate: timestamp('start_date').notNull(),
  expiryDate: timestamp('expiry_date').notNull(),
  status: subscriptionStatusEnum('status').default('Pending').notNull(),
  usageLimitsViews: integer('usage_limits_views').default(0),
  usageLimitsDownloads: integer('usage_limits_downloads').default(0),
  usageStatsViews: integer('usage_stats_views').default(0),
  usageStatsDownloads: integer('usage_stats_downloads').default(0),
});

export const orders = pgTable('orders', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  razorpayOrderId: text('razorpay_order_id').notNull(),
  razorpayPaymentId: text('razorpay_payment_id'),
  amount: integer('amount').notNull(),
  currency: text('currency').default('INR').notNull(),
  status: paymentStatusEnum('status').default('Pending').notNull(),
  receipt: text('receipt'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const quotations = pgTable('quotations', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  quotationNumber: text('quotation_number').notNull(),
  itemsJson: jsonb('items_json').notNull(),
  totalAmount: integer('total_amount').notNull(),
  pdfS3Key: text('pdf_s3_key'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  orderId: uuid('order_id').references(() => orders.id),
  userId: uuid('user_id').references(() => users.id),
  invoiceNumber: text('invoice_number').notNull(),
  grandTotal: integer('grand_total').notNull(),
  pdfS3Key: text('pdf_s3_key'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usageLogs = pgTable('usage_logs', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id),
  userEmail: text('user_email'),
  institutionId: uuid('institution_id').references(() => institutions.id),
  contentId: uuid('content_id'), // FK to content table
  contentTitle: text('content_title'),
  action: text('action').notNull(), // 'View' | 'Download'
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

export const content = pgTable('content', {
  id: uuid('id').defaultRandom().primaryKey(),
  submissionId: text('submission_id'), // e.g. STM-SUB-123
  title: text('title').notNull(),
  authors: text('authors').notNull(),
  contentType: text('content_type').notNull(),
  subjectArea: text('subject_area'),
  fileS3Key: text('file_s3_key'),
  publishingMode: publishModeEnum('publishing_mode').notNull(),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
});
