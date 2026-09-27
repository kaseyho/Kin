import { render, screen, userEvent } from '@testing-library/react-native';

import { LegalDocumentScreen } from '../LegalDocumentScreen';

it('describes the real data flow and safety-report retention in the privacy policy', async () => {
  await render(
    <LegalDocumentScreen
      documentId="privacy"
      onBack={jest.fn()}
      supportEmail="support@kin.example.org"
    />,
  );

  expect(screen.getByRole('header', { name: 'Privacy Policy' })).toBeTruthy();
  expect(screen.getByText(/Supabase/i)).toBeTruthy();
  expect(screen.getByText(/RevenueCat/i)).toBeTruthy();
  expect(screen.getByText(/180 days/i)).toBeTruthy();
  expect(screen.getByText(/does not sell your personal information/i)).toBeTruthy();
});

it('offers in-app and external account deletion paths', async () => {
  const user = userEvent.setup();
  const onOpenDocument = jest.fn();
  await render(
    <LegalDocumentScreen
      documentId="account-deletion"
      onBack={jest.fn()}
      onOpenDocument={onOpenDocument}
      supportEmail="support@kin.example.org"
    />,
  );

  expect(screen.getByRole('header', { name: 'Delete Your Kin Account' })).toBeTruthy();
  expect(screen.getByText(/Profile.*Delete account/i)).toBeTruthy();
  expect(screen.getByText(/Moments you created/i)).toBeTruthy();
  expect(screen.getByText(/same durable deletion and media-cleanup sequence/i)).toBeTruthy();
  expect(screen.getByRole('link', { name: /Request account deletion by email/i })).toBeTruthy();

  await user.press(screen.getByRole('link', { name: 'Read the Privacy Policy' }));
  expect(onOpenDocument).toHaveBeenCalledWith('privacy');
});
