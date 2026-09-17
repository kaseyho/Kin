import { render, screen } from '@testing-library/react-native';

import { ConversationStatusBanner } from '../ConversationStatusBanner';

it.each([
  ['offline', 'You’re offline. You can keep writing and retry when you reconnect.'],
  ['reconnecting', 'Reconnecting… Your conversation stays available.'],
  ['restored', 'Back online. Kin is up to date.'],
] as const)('renders an accessible %s state', async (phase, copy) => {
  await render(<ConversationStatusBanner phase={phase} />);
  expect(screen.getByRole('alert')).toBeTruthy();
  expect(screen.getByText(copy)).toBeTruthy();
});

it('stays out of the layout while online', async () => {
  await render(<ConversationStatusBanner phase="online" />);
  expect(screen.queryByRole('alert')).toBeNull();
});
