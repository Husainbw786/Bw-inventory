import { createFileRoute, Link } from "@tanstack/react-router";
import { SUPPORT_EMAIL, accountDeletionMailto } from "@/lib/support";

// Public privacy policy: linked from the Play Store listing and the app.
// Rendered outside AppLayout (see publicPaths in __root.tsx) so it works signed out.
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy policy — BW Inventory" },
      {
        name: "description",
        content: "How BW Inventory collects, uses, stores and deletes your data.",
      },
    ],
  }),
  component: PrivacyPage,
});

const LAST_UPDATED = "29 September 2026";

function PrivacyPage() {
  return (
    <div className="min-h-dvh" style={{ background: "var(--pe-bg)" }}>
      <header
        className="text-white"
        style={{
          background: "linear-gradient(160deg,#0E6B57 0%,#0A4E40 100%)",
          padding: "28px 20px",
        }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span
            className="flex items-center justify-center font-extrabold"
            style={{
              width: 46,
              height: 46,
              borderRadius: 13,
              background: "#fff",
              color: "var(--pe-green)",
              fontSize: 19,
              letterSpacing: "-0.04em",
            }}
          >
            BW
          </span>
          <div>
            <div style={{ fontSize: 18, fontWeight: 780, letterSpacing: "-0.02em" }}>
              BW Inventory
            </div>
            <div style={{ fontSize: 12.5, opacity: 0.72 }}>
              Privacy policy · last updated {LAST_UPDATED}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8 text-[15px] leading-relaxed text-[color:var(--pe-ink)]">
        <Section title="What BW Inventory is">
          <p>
            BW Inventory is a shop inventory and billing app. A business owner creates a business,
            invites team members, and records items, purchases, sales, GST bills, expenses, and the
            customers and dealers they trade with. This policy explains what data the app handles
            and what you can do about it.
          </p>
        </Section>

        <Section title="Data we collect">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>Account data.</b> Your email address and, when you sign in with Google, the name
              and profile picture Google shares. Passwords are handled by our authentication
              provider (Supabase) and are never visible to us.
            </li>
            <li>
              <b>Business data you enter.</b> Business name, address, phone number and GSTIN; items
              and stock; purchases, sales, bills and payments; expenses; and the names, phone
              numbers, addresses and GSTINs of your customers and dealers. This data belongs to the
              business that recorded it and is visible to that business's members.
            </li>
            <li>
              <b>Phone contacts.</b> Only when you tap "Import from contacts" and pick entries in
              your phone's contact picker. The app receives just the contacts you select and saves
              them as customers or dealers. It never reads your address book in the background.
            </li>
            <li>
              <b>Technical data.</b> Standard server logs (IP address, browser or app version, time
              of request) kept by our hosting provider for security and troubleshooting.
            </li>
          </ul>
        </Section>

        <Section title="How we use it">
          <p>
            Solely to run the service for you: signing you in, showing your business's records to
            its members, generating bills and statements, and sending the bills you choose to share.
            We do not sell personal data, do not show advertising, and do not use your data to train
            models.
          </p>
        </Section>

        <Section title="Optional integrations you control">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <b>Google Sheets backup.</b> If an owner turns it on, the business's records are
              mirrored to a Google Sheet as a backup. Turn it off in Business settings.
            </li>
            <li>
              <b>WhatsApp sending.</b> If an owner connects a WhatsApp number, bills you choose to
              send are delivered through a WhatsApp gateway to the customer's number. Disconnect it
              in Business settings at any time.
            </li>
          </ul>
        </Section>

        <Section title="Where data is stored and who can see it">
          <p>
            Data is stored in a Supabase (PostgreSQL) database and served through Cloudflare. All
            traffic is encrypted in transit (HTTPS). Access is restricted per business by
            database-level row security: members of a business can only see that business's records,
            and only owners can change settings, invite members, or delete the business. We share
            data with third parties only as needed to provide the service (hosting, authentication,
            and the optional integrations above) and when required by law.
          </p>
        </Section>

        <Section title="Retention">
          <p>
            Business records are kept for as long as the business exists in the app. Deleting a
            business removes its records. Server logs are retained by our providers for a limited
            period for security purposes.
          </p>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can request deletion of your account and the personal data linked to it at any time.
            Email{" "}
            <a className="underline" href={accountDeletionMailto()}>
              {SUPPORT_EMAIL}
            </a>{" "}
            from the address you signed up with, or use "Delete my account" in Business settings
            inside the app. We will confirm and complete the deletion within 30 days. Deleting your
            account removes your login and your memberships; records that belong to a business you
            were a member of stay with that business unless you are its only owner, in which case
            the business and its records are deleted too. Bills already issued to customers may be
            retained where tax law requires it.
          </p>
        </Section>

        <Section title="Children">
          <p>BW Inventory is a business tool and is not directed at children under 13.</p>
        </Section>

        <Section title="Changes and contact">
          <p>
            We will update this page when the policy changes and show the date at the top. Questions
            go to{" "}
            <a className="underline" href={`mailto:${SUPPORT_EMAIL}`}>
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <p className="mt-10 text-sm text-[color:var(--pe-ink-3)]">
          <Link to="/" className="underline">
            Back to BW Inventory
          </Link>
        </p>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <h2 className="mb-2 text-base font-bold tracking-tight">{title}</h2>
      <div className="space-y-2 text-[color:var(--pe-ink-2)]">{children}</div>
    </section>
  );
}
