# STM Digital Library: Sales Guide

For sales executives, sales managers, and the administrators who run the sales team.

This guide describes what the app does today (October 2026), taken from the code, not from plans. Where something people often expect does **not** exist (lead buckets, automatic assignment, follow-up reminders), the guide says so plainly.

---

## Contents

1. [Who is who: roles and access](#1-who-is-who-roles-and-access)
2. [Signing in and where you land](#2-signing-in-and-where-you-land)
3. [The Sales Workspace at a glance](#3-the-sales-workspace-at-a-glance)
4. [Where leads come from](#4-where-leads-come-from)
5. [How leads are assigned (and the "bucket" question)](#5-how-leads-are-assigned-and-the-bucket-question)
6. [Pipeline stages](#6-pipeline-stages)
7. [Dashboard](#7-dashboard-sales)
8. [My Leads](#8-my-leads-salesleads)
9. [Lead details](#9-lead-details-salesleadsid)
10. [Subscription Enquiries](#10-subscription-enquiries-salespro-applications)
11. [Activity Log](#11-activity-log-salesactivity)
12. [Performance](#12-performance-salesperformance)
13. [Quotations](#13-quotations)
14. [Notifications](#14-notifications)
15. [The administrator's side](#15-the-administrators-side)
16. [Campaign links](#16-campaign-links)
17. [Coupons](#17-coupons)
18. [Limits and known gaps](#18-limits-and-known-gaps)
19. [Quick reference](#19-quick-reference)

---

## 1. Who is who: roles and access

Every person has one role on their account. Five roles touch sales:

| Role | What it is for | Where they work |
|---|---|---|
| **Sales Executive** | Works the leads assigned to them, raises quotations | Sales Workspace (`/sales`) |
| **Sales Manager** | Same workspace and the same access as an executive (see note below) | Sales Workspace (`/sales`) |
| **Subscription Manager** | Handles quotations, payments, receipts and subscription requests; can assign leads through the API | Manager portal (`/manager`) |
| **Super Admin** | Everything: the sales team, lead assignment, campaigns, coupons, quotations, receipts | Admin portal (`/admin`); can also open `/sales` |
| **Subscriber / Institution / Student** | Customers, not staff | Their own dashboards |

> **Sales Manager vs Sales Executive.** Today the two roles are identical in the app. A Sales Manager sees only the leads assigned to **them** and only the quotations **they** raised. There is no team view for managers. To see the whole team, a Super Admin uses **Admin → Sales Team**.

### What each role can do

| Action | Sales Executive / Manager | Subscription Manager | Super Admin |
|---|---|---|---|
| Open the Sales Workspace | Yes | No (redirected) | Yes |
| See their own assigned leads | Yes | Not applicable | Yes |
| See all leads (Lead Master) | No | API only, no screen | Yes |
| Assign or reassign leads | No | API only, no screen | Yes |
| Change a lead's stage, add notes | Yes | Yes (API) | Yes |
| See Subscription Enquiries | Yes (whole team) | Yes (API) | Yes |
| Approve a subscription request | No | Yes | Yes |
| Create, edit, email, download quotations | Yes (own) | Yes (all) | Yes (all) |
| Mark a quotation **Paid**, issue a receipt | No | Yes | Yes |
| Convert a quotation into a subscription | No | Yes | Yes |
| Add or remove sales team members | No | No | Yes |
| Campaign links and coupons | No | Yes (API) | Yes |

Only a Super Admin can create a staff account or give someone a staff role.

---

## 2. Signing in and where you land

- Sales Executives and Sales Managers sign in at the normal login page and land on **`/sales`** (the dashboard).
- A Super Admin lands on `/admin`. They can open `/sales` and get a **Return to Admin** button in the header.
- Anyone else who opens a `/sales` page sees "Unauthorized access to Sales Portal" and is sent back to their own dashboard.
- A new team member receives their login details by email when the Super Admin creates the account (if "Send login credentials via email" was ticked).
- One account can be signed in on only one device at a time. Signing in somewhere else asks whether to end the other session.

---

## 3. The Sales Workspace at a glance

**Header (top bar):**
- **Sales Workspace** title (links to the public home page)
- **Notification bell**: new leads assigned to you (see [Notifications](#14-notifications))
- Your name and role ("Sales Executive", "Sales Manager", or "Administrator")
- **Moon/sun icon**: switches between dark and light mode
- **Sign out** icon

**Sidebar, in order:**

| Menu item | Address | What it is |
|---|---|---|
| Dashboard | `/sales` | Today's overview |
| My Leads | `/sales/leads` | Every lead assigned to you. A badge shows how many are new (up to "9+") |
| Subscription Enquiries | `/sales/pro-applications` | Members asking for help to subscribe (shared by the whole team) |
| Activity Log | `/sales/activity` | Timeline of notes, calls, emails and meetings on your leads |
| My Quotations | `/sales/quotations` | Quotations you raised |
| Performance | `/sales/performance` | Conversion and value won |

On a phone the sidebar becomes a slide-in menu (hamburger icon), and tables become cards.

---

## 4. Where leads come from

Leads are created **automatically**. There is no "add lead" button and no CSV import.

| Source shown on the lead | Created when | Starting stage |
|---|---|---|
| `Free signup` or `Free signup · <campaign code>` | Anyone registers a free account (staff accounts excluded) | New |
| `Pro application` | A member applies for Premium/Pro from inside the app | In Progress |
| `Demo Request` | Someone fills in the demo request form | New |
| `Contact Inquiry` | Someone sends the contact form | New |
| `AI Assistant` | A visitor asks the website's AI assistant for a quote | New |

Details worth knowing:

- **Signup leads** carry what the person entered: registrant type, designation, location, WhatsApp, and the departments they are interested in (in the lead's notes).
- **Pro applications** reuse an existing lead with the same email if there is one. It is moved to **In Progress**, its source becomes "Pro application", it **keeps its current executive**, and that executive's bell lights up again.
- **AI Assistant** leads are matched to an existing lead by email or phone first. If a match is found, the enquiry is added to that lead's notes and nothing else changes (owner, stage and source are kept).
- The **campaign code** after "Free signup ·" tells you which marketing link the person arrived from (see [Campaign links](#16-campaign-links)).
- A new lead is **not assigned to anyone**. It waits for a Super Admin to assign it (next section).

---

## 5. How leads are assigned (and the "bucket" question)

### There is no bucket rule

The app has **no buckets, territories, round robin, state-wise routing, lead quotas, capacity limits, or "claim a lead" pool.** A lead's state is recorded and used for filters and charts only. It does not decide who gets the lead.

### How assignment actually works

Assignment is **manual and done by a Super Admin** in **Admin → Lead Master** (`/admin/leads`):

1. Filter the list (by stage, state, source, or search by name, email, phone or organisation). Unassigned leads show **"Unassigned"** in red in the *Assigned To* column.
2. Tick the leads to hand out (or "select all visible").
3. Choose an executive or manager from the dropdown.
4. Click **Assign Leads**.

What happens next:

- Each lead gets the executive and the time it was assigned.
- A timeline entry is added to each lead: **System: "Assigned to executive"**.
- The executive's **bell and My Leads badge** go up, and within 30 seconds a pop-up says "N new lead(s) assigned to you".
- **No email** is sent to the executive about the assignment.

**Reassigning** works the same way: assign the lead to someone else and it moves over. The old owner loses it from their list.

**Removing a team member** (Admin → Sales Team → Remove) unassigns all of their leads, which go back to "Unassigned". The person's account is blocked and changed to a normal member; it is not deleted.

### What counts as "your" lead

A lead is yours when it is assigned to you. Your Dashboard, My Leads, Activity Log, Performance and bell all count **only** leads assigned to you. **Subscription Enquiries** are the exception: they are shared with the whole team.

---

## 6. Pipeline stages

Every lead is in exactly one stage at a time. You set it by hand.

| Stage | Meaning in practice | Badge colour |
|---|---|---|
| **New** | Not yet contacted (stored internally as "All") | Grey |
| **Positive** | Interested; conversation going well | Teal |
| **In Progress** | Actively being worked (Pro applications start here) | Teal |
| **No Response** | Tried, no answer | Grey |
| **Subscriber** | Won: they subscribed | Green |
| **Negative** | Not interested / lost | Red |
| **Repeated** | Duplicate or repeat enquiry | Amber |

Important:

- **Nothing moves a lead automatically.** When a customer pays, a quotation is marked Paid, or a subscription is approved, the lead does **not** become "Subscriber" by itself. Set it yourself, or it will not count as a win on your Dashboard and Performance pages.
- **"Gone quiet"** = a lead in **Positive** or **In Progress** that has had no activity for **more than 7 days**. Changing the stage or adding a note counts as activity and resets the clock.
- There are **no follow-up dates, reminders, priority, or hot/warm/cold labels** in the app.

---

## 7. Dashboard (`/sales`)

The greeting changes with the time of day: "Good Morning / Afternoon / Evening, <your name>".

### Headline cards (click any card to open the matching list)

| Card | Number | Small text underneath |
|---|---|---|
| **Total Leads** | All leads assigned to you | "N assigned in the last 30 days" |
| **Subscribers** | Your leads in stage Subscriber | "X% of your leads" |
| **Positive Contacts** | Your leads in stage Positive | "X% of your leads" |
| **In Progress** | Your leads in stage In Progress | "X% of your leads" |

### Needs attention

Four tiles that tell you what to do first. A tile showing 0 reads "All clear".

| Tile | Counts | Opens |
|---|---|---|
| **New leads** | Your leads still in stage New ("Waiting for a first contact") | My Leads filtered to New |
| **Gone quiet** | Positive or In Progress leads with no activity for 7+ days | My Leads, quiet filter |
| **Open quotations** | Your quotations that are not Paid or Cancelled. The small text says how many are past their valid-until date | My Quotations, open only |
| **Enquiries waiting** | Subscription Enquiries still waiting (**whole team**, not just yours) | Subscription Enquiries |

### Pipeline overview (two charts)

- **Status breakdown**: a donut chart of your leads by stage, with the total in the middle and a legend listing each stage's count and percentage. Only stages that have leads appear. Colours: Subscriber green, Positive teal, In Progress light teal, New grey, No Response pale grey, Repeated amber, Negative red.
- **State distribution**: a horizontal bar chart of your **top 8 states** by number of leads ("top 8 of N states"). Leads with no state recorded are not in the bars; a note underneath says how many there are (sign-ups from outside India and some enquiry forms do not capture a state).

### Recent activity

Your 5 latest timeline entries (notes, calls, emails, meetings), each with the lead name, organisation, note and how long ago. **View all** opens the Activity Log.

---

## 8. My Leads (`/sales/leads`)

Every lead assigned to you, most recently active first. Opening this page also clears your "new lead" bell.

**Filters**

- **Stage chips** with counts: All, New (only shown if you have any), Positive, No Response, Subscriber, In Progress, Negative, Repeated
- **Search**: name, email, phone or organisation
- **State** and **Source** dropdowns
- Coming from the "Gone quiet" tile shows a banner: "Showing Positive and In Progress leads with no activity for 7+ days", with **Clear**

**Columns**

| Column | Shows |
|---|---|
| Lead / Organisation | Name (click to open) and organisation |
| Location | State, or "Not recorded" |
| Contact | Email and Call buttons (Call is greyed out when there is no phone number) |
| Source | Where the lead came from (wide screens) |
| Pipeline status | A dropdown: change the stage right here |
| Last activity | How long since anything happened (wide screens) |
| ⋮ | Row menu |

**Row menu (⋮):** View lead · Add note · Create quotation · Email · Call

- Changing the stage from the dropdown saves immediately ("Status updated to …").
- **Create quotation** opens a **blank** quotation form. Nothing is copied from the lead, so type the customer details in (see [Quotations](#13-quotations)).
- There is no sorting, no paging (all your leads load at once), and no bulk actions. The footer says "Showing X of Y assigned leads".

---

## 9. Lead details (`/sales/leads/:id`)

**Top of the page**

- Lead name and stage badge, "Source: …" and state
- **Email** and **Call** buttons
- **Status** dropdown: change the stage
- When the stage is Subscriber a **Provision Account** button appears. **It does not do anything yet**; account access is activated by an administrator.

**Left: contact information**

Email, phone, organisation, state, and **Initial Request Details**: what the person wrote or chose when the lead was created (signup details, demo type, contact message, AI assistant summary, Pro application answers).

**Right: Activity Timeline**

Every entry with who wrote it, its type, the date and time, and the note. Assignment entries show as **System**.

**Adding to the timeline**

1. Pick a **Type**: Note, Call Log, Email Sent, or Meeting
2. Write the **Notes** (required)
3. Click **Add to timeline**

Adding an entry also counts as activity, so the lead stops being "gone quiet".

> Changing the stage does **not** write a timeline entry. If the reason matters ("Lost: chose a competitor"), add a note as well.

There is no WhatsApp entry type, no follow-up scheduling, and lead details (name, phone, etc.) cannot be edited from this page.

---

## 10. Subscription Enquiries (`/sales/pro-applications`)

Members who asked, from inside the app, for help getting a **Premium subscription**. These are **shared by the whole team and not assigned**: whoever is free should call first.

- **Filter:** **Waiting** (default, with count) or **All**
- **Each card shows:** name, when it was submitted, status (**Waiting**, **Approved** or **Declined**), email, phone, organisation, their role, the departments they want to read, how many free sessions they have used, and their own words ("In their words").
- **Actions:** Email, Call, and **Create quotation** (while waiting; opens a blank quotation form)

**What sales does vs what an administrator does**

1. **Sales:** call, agree the terms, raise a quotation if needed.
2. **Administrator:** approves the request under **Subscription Requests** (`/admin/subscription-requests` or `/manager/requests`), which activates the subscription. Or they reject it with a note.

Sales staff cannot approve or decline an enquiry. Approving it does not change the lead's stage, so set the lead to Subscriber yourself.

Every Pro application also sends an email alert (subject "⭐ Pro membership application — <name>") to all Sales Executives, Sales Managers, Subscription Managers and Super Admins, and the matching lead appears (or reappears) in the assigned executive's bell.

---

## 11. Activity Log (`/sales/activity`)

The latest **100** timeline entries on leads currently assigned to you, written by anyone (you, an administrator, or the System assignment entry).

- **Search:** lead, organisation or note text
- **Type filter:** All, Notes, Calls, Emails, Meetings, Status changes
- **Grouped by:** Today, Yesterday, This week, Older
- Each entry shows the type, lead and organisation, time, note, and source. Click it to open the lead.

---

## 12. Performance (`/sales/performance`)

Covers **all** your assigned leads. There is no date-range picker.

| Card | How it is worked out |
|---|---|
| **Conversion rate** | Subscribers ÷ total leads, shown with "target 30%" (a fixed target for everyone) |
| **Open opportunities** | Positive + In Progress |
| **Won deals** | Leads in stage Subscriber |
| **Value won** | Total (₹, including GST) of your quotations marked **Paid** |

- **Pipeline overview:** a bar for each stage with count and percentage. A lead sits in one stage at a time, so this is a snapshot, not a funnel.
- **State efficiency:** a table of State, Won, Leads and Win rate. It shows the top 5 states first, with **View all N states** to expand.

Remember: *Won deals* and *Conversion rate* only count leads you set to **Subscriber**, and *Value won* only counts quotations an administrator has marked **Paid**.

---

## 13. Quotations

### 13.1 My Quotations (`/sales/quotations`)

Every quotation raised from **your** account, newest first. You cannot see quotations raised by colleagues here.

**Cards:** **Raised** (all yours) · **Paid** (and % of raised) · **Open** (not Paid or Cancelled) · **Value won** (₹ total of Paid)

**Search:** quotation number, customer or organisation.
**Status chips:** All, Open, Draft, Sent, Downloaded, Accepted, Expired, Paid, Cancelled.

**Columns:** Quotation number · Customer · Plan · Amount · Created · Valid until (with a badge) · Status · ⋮

**Validity badge** (open quotations only): **Valid** · **Expires soon** (7 days or less left) · **Expired** (past valid-until)

**Row menu:** View (side panel with customer, dates, amounts, line items, notes) · Download PDF · Print · Edit (not available once Paid)

A Paid quotation shows: "Marked paid — the receipt is issued from the admin portal."

### 13.2 Creating a quotation (`/sales/quotations/create`)

One page: the form on the left, a live preview of the quotation sheet on the right.

**Quotation**
- **Quotation No.**: suggested automatically as `ITB/SDL/<financial year>/<number>`, e.g. `ITB/SDL/26-27/014`. The financial year runs April to March. You can edit it on a new quotation; it is locked once saved. If the number is taken when you save, the next free one is used and a message tells you.
- **Quotation date** and **Validity (days)**: default 15, allowed 1 to 365. Valid-until = date + validity.
- **Status**: Draft, Sent, Accepted, Expired, Cancelled.

**Institution / customer**
- **Client email** (required). When you leave this field on a new quotation, empty fields are filled in from that customer's most recent quotation, if there is one.
- **Institution name** (required), contact person, designation, phone, billing address
- **State / UT** (required: it decides the tax, see below)
- Customer GSTIN (optional)

**Subscription**
- **Departments**: chosen from subject groups (Engineering & Technology, Medical & Health Sciences, Life Sciences & Biotechnology, Science & Applied Sciences, Business & Management, Social Sciences, Education & Humanities, Agriculture & Allied Sciences, Architecture & Built Environment, Multidisciplinary)
- **Total full-access users required**
- **Include 5 users?** Yes or No
- **Department pricing:** Fixed (standard slab) or Custom (a rate you type)
- **User pricing:** Fixed (volume slab) or Custom
- **Special discount / adjustment** in ₹
- **Special note / commercial remark**

The **Totals** panel shows department charges, user charges, GST and total payable as you type.

**Buttons**

| Button | What it does |
|---|---|
| **Save quotation** | Saves it (status stays as chosen) |
| **Email to client** | Saves, then emails the PDF to the client (with a copy to the company admin inbox). Status becomes **Sent** unless it is already Accepted |
| **Download PDF** | Saves, then downloads the PDF. A Draft becomes **Downloaded** |
| **Print** | Opens the print dialog |

Before saving, the form checks: quotation number, institution name, a valid email, at least one department, a state, and a rate wherever Custom is chosen.

### 13.3 Pricing (standard rates)

**Departments** (per department, per year; the rate depends on how many are bought together):

| Departments in the quotation | Rate per department |
|---|---|
| 1 | ₹9,990 |
| 2 | ₹9,490 |
| 3 | ₹8,990 |
| 4 | ₹8,490 |
| 5 or more | ₹7,990 |

**Users** (per chargeable user; the rate depends on the total number of users):

| Total users | Rate per chargeable user |
|---|---|
| up to 100 | ₹2,490 |
| 101 to 250 | ₹1,990 |
| 251 to 500 | ₹1,490 |
| 501 to 999 | ₹1,190 |
| 1,000 or more | ₹990 |

With **Include 5 users = Yes**, the first 5 users are included free and the rest are charged. With **No**, every user is charged.

**Calculation:**
`(departments × department rate) + (chargeable users × user rate) − discount = subtotal`, then GST on top.

**GST: 18%.** The company is registered in **Delhi**:

- Customer in **Delhi**: CGST 9% + SGST 9%
- Customer in **any other state or UT**: IGST 18%

All prices are in Indian rupees. The server recalculates every amount itself when you save, so the total on the sheet always follows these rules.

> The form says custom rates are for "an approved special rate". The app does not enforce an approval step, so follow your team's approval process before using Custom rates or large discounts.

**What the PDF contains:** the company letterhead, customer and quotation details, line items, the tax split, the total, bank details with a UPI QR code, an authorised signature, and the terms (100% advance payment, non-refundable after activation, calendar-year subscription period, "valid for N days", and others).

### 13.4 Editing

Open a quotation from the ⋮ menu → **Edit**. You can edit your own quotations until they are **Paid**. Older quotations made before the current format cannot be edited. Quotations cannot be deleted.

### 13.5 What happens after the customer agrees (the administrator's part)

Sales staff cannot mark a quotation Paid. An administrator (Super Admin at `/admin/quotations`, or Subscription Manager at `/manager/quotations`) does one of these:

| Admin action | Result |
|---|---|
| **Payment Received → Create Receipt** (payment method: Bank Transfer, UPI, Razorpay, Cheque, Cash; reference; date) | Quotation becomes **Paid**, a receipt numbered `RCP-YYYY-MM-NN` is issued, and the payment is recorded. The receipt can then be emailed to the customer |
| **Convert to Subscription** (for Accepted quotations) | Creates the customer's subscription and marks the quotation **Paid**. The customer must already have an account with the quotation's email |
| Change status to **Paid** | Quotation becomes Paid and the payment is recorded |

When this happens, the quotation shows **Paid** in your My Quotations and its value counts in your **Value won**. Your **lead does not change stage automatically**, so set it to **Subscriber** yourself.

### 13.6 Quotation statuses

| Status (on screen) | Set by |
|---|---|
| **Draft** | Default for a new quotation |
| **Downloaded** | Download PDF on a Draft |
| **Sent** | Email to client |
| **Accepted** | You or an administrator, by hand |
| **Expired** | By hand only. The app does not expire quotations automatically, but the list shows an "Expired" badge once valid-until has passed |
| **Cancelled** | By hand |
| **Paid** | Administrator only |

---

## 14. Notifications

**In the Sales Workspace**

- The **bell** shows leads newly assigned to you that you have not opened yet, the latest 10 listed as "New lead: <name>" with organisation and source.
- The app checks every 30 seconds. When the number goes up you get a pop-up: "N new lead(s) assigned to you".
- The same number appears on **My Leads** in the sidebar.
- Opening **My Leads** marks them all as seen and clears the bell.
- When a member who is already your lead applies for Pro, the lead comes back into your bell.

**By email, to sales staff**

- Your login details, when your account is created
- Every **Pro membership application** (sent to the whole sales team and the admins)

Not emailed to sales staff: lead assignments, demo requests and contact form messages (these go to the company admin inbox), and copies of quotations (the copy goes to the admin inbox).

---

## 15. The administrator's side

For Super Admins who run the team. All of these are in the **Admin** portal.

### Lead Master (`/admin/leads`)

- **Sees:** every lead, with stage counts, search, and state and source filters (loads up to 200 at a time)
- **Columns:** Lead/Organisation, State, Contact, Source, Status, Assigned To, Date
- **Bulk assign:** described in [section 5](#5-how-leads-are-assigned-and-the-bucket-question)
- **Sync Old Inquiries:** copies older demo requests and contact-form messages into leads if they are not there yet, and renames old stage names (New→New, Contacted→Positive, Converted→Subscriber, Lost→Negative)
- Stages cannot be edited and leads cannot be created from this screen.

### Sales Team (`/admin/sales-team`)

- **Summary:** number of executives, total assigned, total converted, average conversion
- **One card per person:** role (Executive or Manager), leads assigned, subscribers, number of timeline entries
- **Add Executive:** full name, email, role (Sales Executive or Sales Manager), "Send login credentials via email". The password is shown once.
- **Remove:** unassigns the person's leads and blocks their account (not deleted)

**Conversion rate** here = that person's leads in stage Subscriber ÷ their assigned leads.

### Executive pipeline (`/admin/sales-team/:id`)

Click a person's card to see their pipeline:

- Conversion rate and cards (Total Leads, Subscribers, Positive, In Progress, No Response)
- The same **Status breakdown** and **State distribution** charts the executive sees
- A summary of Negative, Repeated and total timeline entries
- Their lead table with stage filters. Clicking a lead opens a read-only panel with contact details and the full timeline.

To reassign from here, go back to Lead Master.

### Quotations, receipts and subscription requests

- **Quotations** (`/admin/quotations`, also `/manager/quotations`): all quotations from everyone, grouped by customer, with a **Generated By** column. Status tabs, total revenue, change status, Create Receipt, Convert to Subscription, view the sent email.
- **Receipts** (`/admin/receipts`): every receipt, total collected, download or email a receipt.
- **Subscription Requests** (`/admin/subscription-requests`, also `/manager/requests`): Pending, Approved, Rejected. **Approve & Activate** creates the subscription; **Reject** records a note.

---

## 16. Campaign links

**Admin → Campaigns** (`/admin/campaigns`) creates tracked links so you can see which marketing effort brought people in.

- Register a campaign with a name, channel (Facebook, Instagram, WhatsApp, LinkedIn, Email, Poster, Other), owner and landing page.
- The app gives it a code such as `wa-riya-diwali-offer` and a link like `https://journalslibrary.com/?ref=wa-riya-diwali-offer`. For Sendy email campaigns, add `ref=<code>` to the link.
- The code is remembered for 90 days after someone clicks. If they register within that time, their lead's source reads **`Free signup · <code>`**.
- The campaigns screen shows, per campaign: signups, how many verified their email, and how many have read something. It also shows a top-marketer summary.
- A campaign that has signups cannot be deleted; switch it off instead.

**Links without a `?ref=` code cannot be traced later**, so always use the generated link.

---

## 17. Coupons

**Admin → Coupons** (`/admin/coupons`) lets an administrator create discount codes (percentage or fixed ₹, maximum uses, minimum order, valid dates) and view their usage.

> **Coupons are not connected to quotations or checkout yet.** The quotation form has no coupon field, and nothing applies or counts coupon use. To give a discount on a quotation, use **Special discount / adjustment**.

---

## 18. Limits and known gaps

What the app does not do today, so nobody relies on it. Items marked ⚠ are worth fixing.

**Leads and pipeline**
- No automatic assignment, buckets, territories, round robin or quotas. A Super Admin assigns every lead by hand.
- No manual "add lead" and no CSV import.
- No follow-up dates, reminders, priority or temperature.
- Leads never become **Subscriber** automatically: not on payment, quotation Paid, subscription approval or conversion.
- Changing a stage is not written to the timeline.
- The **Provision Account** button on a Subscriber lead does nothing.
- ⚠ A sales user who knows a lead's address (`/sales/leads/<id>`) can open and change a lead that is **not** assigned to them. Only the lists are limited to your own leads.

**Roles**
- ⚠ Sales Managers have no team view; they have exactly the same access as an executive.
- Subscription Managers can assign leads through the system but have no screen for it.

**Quotations**
- No link between a quotation and a lead. "Create quotation" from a lead or enquiry opens a blank form.
- ⚠ The email pre-fill uses the customer's latest quotation from **anyone**, so details raised by a colleague can appear in your form.
- Quotations do not expire by themselves; only the badge shows it.
- Executives can set a quotation to **Accepted** themselves.
- Custom rates and discounts need no approval in the app.
- ⚠ The quotation email always says "Subscription Duration: Annual" and shows its own validity line. Check it matches what was agreed.
- **Convert to Subscription** creates the subscription but does not record a payment or receipt; **Create Receipt** does.
- Quotations cannot be deleted.

**Other**
- Coupons are not used anywhere in quotations or checkout.
- Executives are not emailed when leads are assigned.
- The Performance target (30%) is the same for everyone and cannot be changed in the app.
- The Performance "Open opportunities" card counts Positive + In Progress, but clicking it shows In Progress only.

---

## 19. Quick reference

### Daily routine for an executive

1. Open the **Dashboard** and clear **Needs attention**: contact **New leads**, revive **Gone quiet** ones, chase **Open quotations** near expiry, pick up **Enquiries waiting**.
2. For every contact, open the lead and **Add to timeline** (Call Log, Email Sent, Meeting or Note).
3. **Change the stage** as the conversation moves.
4. When the customer agrees, **raise a quotation** and **Email to client**.
5. When the administrator marks it **Paid**, set the lead to **Subscriber**.

### All sales addresses

| Address | Who | Page |
|---|---|---|
| `/sales` | Sales, Super Admin | Dashboard |
| `/sales/leads` | Sales, Super Admin | My Leads |
| `/sales/leads/:id` | Sales, Super Admin | Lead details |
| `/sales/pro-applications` | Sales, Super Admin | Subscription Enquiries |
| `/sales/activity` | Sales, Super Admin | Activity Log |
| `/sales/performance` | Sales, Super Admin | Performance |
| `/sales/quotations` | Sales, Super Admin | My Quotations |
| `/sales/quotations/create` | Sales, Super Admin | Quotation builder (`?edit=<id>` to edit) |
| `/admin/leads` | Super Admin | Lead Master: all leads, assignment |
| `/admin/sales-team` | Super Admin | Sales team |
| `/admin/sales-team/:id` | Super Admin | One person's pipeline |
| `/admin/quotations` | Super Admin | All quotations |
| `/admin/receipts` | Super Admin | Receipts |
| `/admin/subscription-requests` | Super Admin | Subscription requests |
| `/admin/campaigns` | Super Admin | Campaign links |
| `/admin/coupons` | Super Admin | Coupons |
| `/manager/quotations` | Subscription Manager, Super Admin | All quotations |
| `/manager/requests` | Subscription Manager, Super Admin | Subscription requests |

### Words used in the app

| Word | Means |
|---|---|
| **New** | A lead nobody has contacted yet (stored as "All") |
| **Gone quiet** | Positive or In Progress with no activity for 7+ days |
| **Subscription Enquiry** | A member asking for help to subscribe (formerly "Pro application") |
| **Draft** | A saved quotation not yet sent (stored as "Pending") |
| **Accepted** | Customer agreed to the quotation (stored as "Approved") |
| **Value won** | ₹ total of your quotations marked Paid |
| **Campaign code / ref** | The tag on a marketing link that shows where a signup came from |

---

### For developers

The main code behind this guide:

- **Sales screens:** `src/components/sales/`
- **Quotation builder:** `src/components/quotation/QuotationBuilder.tsx`
- **Quotation pricing and rules:** `src/lib/quotation/quotationModel.ts`, `src/lib/institutionPricing.ts`
- **Admin screens:** `src/components/admin/AdminLeadManager.tsx`, `AdminSalesTeam.tsx`, `AdminExecutivePipeline.tsx`, `QuotationManager.tsx`, `AdminCampaigns.tsx`
- **Server:** `server.ts`, the `/api/sales/*`, `/api/admin/leads*`, `/api/admin/sales-team*` and `/api/quotation/*` routes
- **Data models:** `prisma/schema.prisma` (`Lead`, `LeadInteraction`, `Quotation`, `Receipt`, `Campaign`, `Coupon`)
