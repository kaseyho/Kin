export type LegalDocumentId =
  | 'privacy'
  | 'terms'
  | 'community-standards'
  | 'support'
  | 'account-deletion';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface LegalDocument {
  eyebrow: string;
  title: string;
  summary: string;
  effectiveDate?: string;
  sections: LegalSection[];
}

export const legalDocuments: Record<LegalDocumentId, LegalDocument> = {
  privacy: {
    eyebrow: 'YOUR PRIVACY',
    title: 'Privacy Policy',
    summary: 'What Kin collects, why it is needed, and the choices you have.',
    effectiveDate: 'September 27, 2026',
    sections: [
      {
        heading: 'The short version',
        paragraphs: [
          'Kin is a private space for two people. Kin does not sell your personal information, run ads, create public profiles, or send your private relationship content to an AI model.',
        ],
      },
      {
        heading: 'Information you give Kin',
        paragraphs: ['Kin processes information you choose to provide so the app can work.'],
        bullets: [
          'Account details, including your email address, display name, and profile photo.',
          'Your Kin Space, including invitations, messages, photos, reactions, Moments, nicknames, themes, and relationship preferences.',
          'Support requests and safety reports, including the category, optional details, and the content you report.',
        ],
      },
      {
        heading: 'Information created when you use Kin',
        paragraphs: ['Kin also processes limited service information.'],
        bullets: [
          'Push-notification tokens, notification preferences, and delivery status.',
          'Subscription customer identifiers, product and entitlement status, store platform, and purchase events. Kin does not receive your full payment-card number.',
          'Technical records needed to secure, operate, troubleshoot, and prevent abuse of the service.',
        ],
      },
      {
        heading: 'How Kin uses information',
        paragraphs: ['Kin uses this information to:'],
        bullets: [
          'Create and secure your account and Kin Space.',
          'Deliver messages, Moments, reactions, invitations, notifications, and paid Kin+ features.',
          'Respond to support, privacy, deletion, and safety requests.',
          'Maintain reliability, investigate abuse, and meet legal obligations.',
        ],
      },
      {
        heading: 'Service providers',
        paragraphs: [
          'Kin uses Supabase for authentication, database, file storage, real-time updates, and server functions; RevenueCat to manage purchases and subscription entitlements; and Expo push services with Apple or Google delivery systems for notifications. These providers process information only to provide their services to Kin and under their own terms and privacy commitments.',
        ],
      },
      {
        heading: 'Who can see relationship content',
        paragraphs: [
          'Messages and shared Moments are visible to the two members of a Kin Space. Items saved as private stay visible only to the person who saved them unless that person shares them. A report is not shown to the other member.',
        ],
      },
      {
        heading: 'Retention and deletion',
        paragraphs: [
          'You can delete your account from Profile. Kin removes your profile and account-owned content and queues account-owned media for deletion. A remaining member keeps their own content and the shared Kin Space history that belongs to them.',
          'Safety reports are kept for up to 180 days so Kin can investigate abuse, maintain an audit trail, and respond to disputes. Reporter and reported-user identifiers are removed if the related account is deleted. Other information is kept only as long as needed for the service, security, legal obligations, or a request you made, then deleted or de-identified.',
        ],
      },
      {
        heading: 'Your choices',
        paragraphs: [
          'Profile lets you update your profile, manage notifications, export your account data, leave or archive a Kin Space, and delete your account. You can also request account deletion without access to the app from the public Delete Your Kin Account page.',
        ],
      },
      {
        heading: 'Security and changes',
        paragraphs: [
          'Kin uses access controls, private storage, encrypted network connections, and server-side authorization to protect your information. No service can promise absolute security. Kin may update this policy as the product or law changes and will publish the new effective date here.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['For privacy questions, data access, or deletion help, contact Kin support below.'],
      },
    ],
  },
  terms: {
    eyebrow: 'USING KIN',
    title: 'Terms of Use',
    summary: 'The ground rules for using Kin and Kin+.',
    effectiveDate: 'September 27, 2026',
    sections: [
      {
        heading: 'Agreement',
        paragraphs: [
          'By creating an account or using Kin, you agree to these Terms and the Privacy Policy. If you cannot legally agree to these Terms where you live, do not use Kin.',
        ],
      },
      {
        heading: 'Your account',
        paragraphs: [
          'Provide accurate information, keep access to your email secure, and tell Kin support if you believe someone has accessed your account. You are responsible for activity performed through your account.',
        ],
      },
      {
        heading: 'Your content',
        paragraphs: [
          'You keep ownership of content you create. You give Kin a limited permission to host, process, reproduce, and deliver that content only as needed to operate, secure, and improve the service. You must have the right to share anything you upload.',
        ],
      },
      {
        heading: 'Respectful and lawful use',
        paragraphs: [
          'Follow the Community Standards. Do not use Kin to harass, threaten, exploit, impersonate, defraud, distribute illegal content, violate another person’s privacy or rights, interfere with the service, or attempt unauthorized access. Kin may restrict or end access when reasonably necessary to protect people, the service, or comply with law.',
        ],
      },
      {
        heading: 'Kin+ subscriptions',
        paragraphs: [
          'Prices, billing period, any trial, and renewal terms are shown before purchase. Purchases are processed by the platform or payment provider shown at checkout. Unless the checkout says otherwise, subscriptions renew until canceled through the same store or billing provider. Deleting Kin does not automatically cancel a subscription, and deleting an account does not by itself guarantee a store refund. Refunds follow the rules of the store that processed the purchase.',
        ],
      },
      {
        heading: 'Service availability',
        paragraphs: [
          'Kin may change, suspend, or discontinue features and may need maintenance or experience outages. Kin is provided on an “as available” basis to the extent permitted by law. Kin does not promise that the service will always be uninterrupted or error-free.',
        ],
      },
      {
        heading: 'Responsibility and disputes',
        paragraphs: [
          'To the extent permitted by applicable law, Kin is not responsible for indirect or consequential loss arising from use of the service. Nothing in these Terms removes consumer rights or liability that cannot legally be limited. Applicable law determines any rights and remedies not stated here.',
        ],
      },
      {
        heading: 'Ending use and changes',
        paragraphs: [
          'You may stop using Kin or delete your account at any time. Kin may update these Terms as the service or law changes and will publish a new effective date. If a material change requires your consent, Kin will ask before it applies.',
        ],
      },
      {
        heading: 'Contact',
        paragraphs: ['Questions about these Terms can be sent to Kin support below.'],
      },
    ],
  },
  'community-standards': {
    eyebrow: 'KEEP KIN SAFE',
    title: 'Community Standards',
    summary: 'Kin should feel private, respectful, and safe for both people.',
    effectiveDate: 'September 27, 2026',
    sections: [
      {
        heading: 'Respect each other',
        paragraphs: [
          'Do not use Kin for harassment or bullying, unwanted repeated contact, coercion, stalking, humiliation, or sharing someone’s private information without permission.',
        ],
      },
      {
        heading: 'No threats or abuse',
        paragraphs: [
          'Do not threaten violence or self-harm, celebrate violence, target people with hateful or abusive content, or use Kin to facilitate exploitation or illegal activity.',
        ],
      },
      {
        heading: 'Sexual content and consent',
        paragraphs: [
          'Never share sexual content without the informed consent of every person depicted. Sexual exploitation, sexual content involving minors, and threats to share intimate material are prohibited.',
        ],
      },
      {
        heading: 'Authenticity and spam',
        paragraphs: [
          'Do not impersonate another person, deceive people for money or access, send spam, manipulate the service, or use automated systems to scrape or disrupt Kin.',
        ],
      },
      {
        heading: 'Reporting and enforcement',
        paragraphs: [
          'You can report a message or Kin Space from inside the app. Reports are private and are not shown to the other member. Kin may preserve relevant evidence, limit features, suspend accounts, or take other proportionate action after review. Deliberately false or abusive reports may also violate these standards.',
        ],
      },
      {
        heading: 'Immediate danger',
        paragraphs: [
          'Kin is not an emergency service. If you or someone else may be in immediate danger, contact local emergency services or a trusted person who can help now.',
        ],
      },
      {
        heading: 'Get help',
        paragraphs: ['Contact Kin support for safety help or questions about these standards.'],
      },
    ],
  },
  support: {
    eyebrow: 'WE ARE HERE TO HELP',
    title: 'Kin Support',
    summary: 'Help with your account, privacy, safety, and Kin+.',
    sections: [
      {
        heading: 'Account and access',
        paragraphs: [
          'For sign-in trouble, invitation issues, exports, or profile help, include the email used for Kin and a short description of what happened. Never send a one-time sign-in code to support.',
        ],
      },
      {
        heading: 'Privacy and account deletion',
        paragraphs: [
          'Signed-in members can export or delete their account from Profile. If you cannot access Kin, use the public Delete Your Kin Account page to request deletion by email.',
        ],
      },
      {
        heading: 'Safety',
        paragraphs: [
          'Report a specific message from its actions menu, or report a Kin Space from Relationship settings. If you need follow-up, include the report reference in your email. Kin is not an emergency service.',
        ],
      },
      {
        heading: 'Kin+ billing',
        paragraphs: [
          'Restore purchases from the Kin+ screen if an existing subscription is missing. Manage or cancel through the store or billing provider used to purchase. Include the platform and product in a billing support request, but never email full payment-card details.',
        ],
      },
      {
        heading: 'Contact Kin',
        paragraphs: ['Email is the public support channel for Kin.'],
      },
    ],
  },
  'account-deletion': {
    eyebrow: 'ACCOUNT CONTROL',
    title: 'Delete Your Kin Account',
    summary: 'Delete in the app, or request deletion if you cannot sign in.',
    effectiveDate: 'September 27, 2026',
    sections: [
      {
        heading: 'Delete account in Kin',
        paragraphs: [
          'Open Profile, choose Delete account, verify the six-digit code sent to your account email, then type DELETE to confirm. Deletion is permanent and signs you out.',
        ],
      },
      {
        heading: 'Request deletion without the app',
        paragraphs: [
          'If you cannot sign in, email Kin support from the address used for your account with the subject “Delete my Kin account”. Kin will reply with an ownership-verification step. After verification, an authorized operator processes the request through the same durable deletion and media-cleanup sequence used by the app.',
        ],
      },
      {
        heading: 'What is deleted',
        paragraphs: [
          'Kin deletes your account profile, authentication account, messages, reactions, Moments you created, notification tokens, preferences, and account-owned media. A remaining member keeps their own content and the shared Kin Space history that belongs to them.',
        ],
      },
      {
        heading: 'Limited safety retention',
        paragraphs: [
          'Safety reports and related evidence may be retained for up to 180 days for abuse prevention, disputes, and legal obligations. Your account identifiers are removed from those retained reports after deletion. Kin may retain only additional information required by law or to document completion of the request.',
        ],
      },
      {
        heading: 'Cancel subscriptions separately',
        paragraphs: [
          'Account deletion does not automatically cancel a subscription billed by Apple, Google, or another payment provider. Cancel it through the provider that processed the purchase to prevent future renewal.',
        ],
      },
    ],
  },
};

export const legalDocumentPaths: Record<LegalDocumentId, string> = {
  privacy: '/privacy',
  terms: '/terms',
  'community-standards': '/community-standards',
  support: '/support',
  'account-deletion': '/account-deletion',
};
