import { screen, userEvent } from '@testing-library/react-native';

import { renderKin, createTestRepository } from '../../../../tests/helpers/renderKin';
import { ChatListScreen } from '../ChatListScreen';

describe('ChatListScreen', () => {
  it('makes the first Kin Space the only primary empty-state action', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: 'asset://kin/maya' });
    await renderKin(
      <ChatListScreen onNewSpace={jest.fn()} onOpenSpace={jest.fn()} />,
      repository,
    );

    expect(await screen.findByText('A space for the people who matter.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Create your first Kin Space' })).toBeTruthy();
  });

  it('opens a relationship from a scannable latest-message row', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const onOpenSpace = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <ChatListScreen onNewSpace={jest.fn()} onOpenSpace={onOpenSpace} />,
      repository,
    );

    expect(await screen.findByText('Always. I will pick somewhere warm.')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Open Kin Space with Jamie' }));

    expect(onOpenSpace).toHaveBeenCalledWith('space-maya-jamie');
  });
});
