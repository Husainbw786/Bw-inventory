# Google Play listing — BW Inventory

Copy for the Play Console forms. Character limits are Play's. Edit freely; nothing here is read by code.

## App details

| Field            | Value                                   |
| ---------------- | --------------------------------------- |
| App name (≤30)   | BW Inventory                            |
| Default language | English (United Kingdom)                |
| App or game      | App                                     |
| Free or paid     | Free                                    |
| Category         | Business                                |
| Tags             | Inventory, Invoicing, Small business    |
| Email            | husainhackerrank@gmail.com              |
| Website          | https://bwinventory.husainbw.in         |
| Privacy policy   | https://bwinventory.husainbw.in/privacy |

## Short description (≤80 characters)

```
Stock, GST bills, purchases, expenses and khata for your shop, in one app.
```

## Full description (≤4000 characters)

```
BW Inventory is a simple, fast shop manager for small trading businesses. Keep your stock right, raise GST bills in seconds, and always know who owes you what.

ITEMS & STOCK
• Item catalogue with HSN/SAC code, GST slab and default selling price
• Live stock from purchases, sales and manual adjustments (opening stock, damage, counts, returns)
• Low-stock alerts so you reorder before you run out

SALES & GST BILLS
• Multi-line sales with automatic prices and per-line GST
• Sequential bill numbers per business
• CGST+SGST or IGST worked out automatically from the customer's GSTIN state code
• Download or print bills as PDF, or send them on WhatsApp

PURCHASES & EXPENSES
• Stock-in entries against dealers
• Quick expense log
• One-tap quick entry for money in and money out

KHATA (LEDGER)
• Customers and dealers with GSTIN and opening balance
• Outstanding receivables and payables at a glance
• Dated payments by cash, UPI, bank or cheque
• Import parties straight from your phone contacts

TEAM
• Invite staff to your business by link
• Owner, admin and member roles
• Switch between multiple businesses from one account

REPORTS
• Sales, purchases and expenses over time, with charts

Works on your phone, tablet and computer with the same account. Optional Google Sheets backup mirrors every record to a spreadsheet you own.

Your data belongs to your business. No ads, no selling of data. See the privacy policy at bwinventory.husainbw.in/privacy.
```

## Graphics

| Asset             | Requirement                                                | File                                        |
| ----------------- | ---------------------------------------------------------- | ------------------------------------------- |
| App icon          | 512×512 PNG, ≤1 MB, no transparency                        | `store-assets/icon-512.png`                 |
| Feature graphic   | 1024×500 PNG/JPG                                           | `store-assets/feature-graphic-1024x500.png` |
| Phone screenshots | 2–8, 16:9 or 9:16, each side 320–3840 px (1080×1920 works) | capture on a phone from the installed app   |

Screenshots to capture (portrait, signed in with demo data, no personal customer names):

1. Dashboard `/` — stock and money summary
2. New bill composer `/sales/new` with a few lines and the GST split visible
3. Bill detail `/bills/<id>` — the printable invoice
4. Items list `/items` with a low-stock badge
5. Directory / khata `/directory` showing outstanding balances
6. Quick entry `/entry?type=in`
7. Reports `/reports`

## Store settings → App content

**Privacy policy**: `https://bwinventory.husainbw.in/privacy`

**Ads**: No, the app does not contain ads.

**App access**: All functionality requires sign-in. Provide a test account for Google's reviewers: create a business with sample data and give its email/password under "Instructions". (Google sign-in is optional; email/password is enough.)

**Content rating (IARC questionnaire)**: Utility/Productivity. No violence, sexual content, profanity, drugs, gambling, or user-to-user communication. Result should be "Everyone".

**Target audience**: 18 and over. Not designed for children.

**News app**: No. **COVID-19 contact tracing**: No. **Government app**: No.

**Financial features**: the app records bills and payments but does not process payments, offer loans, or move money. Answer "None of the above" unless the questionnaire's wording has changed.

**Data safety**

| Question                                 | Answer                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the app collect or share user data? | Yes, collects. Does not share with third parties for their own purposes.                                                                                                                                                                                                                                          |
| Is data encrypted in transit?            | Yes                                                                                                                                                                                                                                                                                                               |
| Can users request deletion?              | Yes — in-app "Delete my account" (Business settings) and by email; described at /privacy                                                                                                                                                                                                                          |
| Data types collected                     | Personal info: **email address**, **name** (account). Contacts: **contacts** (only when the user picks entries in the phone's contact picker; optional). App activity / other: **user-generated content** (business records: items, bills, purchases, expenses, customer and dealer details entered by the user). |
| Purpose                                  | App functionality, account management                                                                                                                                                                                                                                                                             |
| Required or optional                     | Email/name: required for the account. Contacts: optional. Business records: required for app functionality.                                                                                                                                                                                                       |
| Ephemeral processing                     | No                                                                                                                                                                                                                                                                                                                |

**Account deletion (Data deletion policy)**: URL `https://bwinventory.husainbw.in/privacy` (section "Deleting your account"). Some data may be retained where tax law requires (issued bills).

**Permissions**: the app declares no dangerous permissions (contacts use the browser's Contact Picker, which is user-initiated and needs no Android permission).

## Release notes — 1.0.0

```
First release of BW Inventory for Android.
• Items and live stock with low-stock alerts
• GST bills as PDF, print or share on WhatsApp
• Purchases, expenses and quick entry
• Customer and dealer khata with payments
• Team invites and multiple businesses
```

## Testing track notes

- Internal testing first (up to 100 testers, immediate). Add your own account.
- Closed testing: at least 12 testers opted in for 14 continuous days before production access can be requested (personal developer accounts). Use shop staff and friends; they need the opt-in link and must keep the app installed.
- Each new upload must have a higher versionCode — the workflow uses its run number, so just re-run it.
