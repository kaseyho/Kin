import { render, screen } from '@testing-library/react-native';

import { ConfigurationErrorScreen } from '../ConfigurationErrorScreen';

it('explains how a developer can recover from invalid runtime configuration', async () => {
  await render(<ConfigurationErrorScreen message="Set EXPO_PUBLIC_KIN_ENVIRONMENT" />);

  expect(screen.getByRole('header', { name: 'Kin needs configuration' })).toBeTruthy();
  expect(screen.getByText('Set EXPO_PUBLIC_KIN_ENVIRONMENT')).toBeTruthy();
  expect(screen.getByText(
    'Open the developer setup guide, update the environment, then restart Kin.',
  )).toBeTruthy();
});
