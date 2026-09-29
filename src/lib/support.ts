// Contact address shown on the public privacy page and used for account-deletion
// requests (required by Google Play for apps with account sign-up).
export const SUPPORT_EMAIL = "husainhackerrank@gmail.com";

export function accountDeletionMailto(userEmail?: string | null) {
  const subject = encodeURIComponent("BW Inventory — delete my account");
  const body = encodeURIComponent(
    `Please delete my BW Inventory account${userEmail ? ` (${userEmail})` : ""} and the personal data linked to it.\n\n` +
      "I understand this cannot be undone and that businesses I own will need another owner or will be removed.",
  );
  return `mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`;
}
