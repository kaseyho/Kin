import { screen, userEvent } from '@testing-library/react-native';

import { renderKin, createTestRepository } from '../../../../tests/helpers/renderKin';
import { CreateJoinSpaceScreen } from '../CreateJoinSpaceScreen';

describe('CreateJoinSpaceScreen', () => {
  it('creates a Kin Space without forcing a relationship label', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: 'asset://kin/maya' });
    const onSpaceReady = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <CreateJoinSpaceScreen onSpaceReady={onSpaceReady} />,
      repository,
    );

    await user.type(screen.getByLabelText('Who is this Space with?'), 'Jamie');
    await user.type(screen.getByLabelText('Relationship start date, optional'), '2025-12-05');
    await user.press(screen.getByRole('button', { name: 'Create our Kin Space' }));

    expect(onSpaceReady).toHaveBeenCalledWith('space-3');
  });

  it('keeps an invalid invitation available for correction', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ displayName: 'Maya', avatarUri: 'asset://kin/maya' });
    const user = userEvent.setup();
    await renderKin(
      <CreateJoinSpaceScreen onSpaceReady={jest.fn()} />,
      repository,
    );

    await user.press(screen.getByRole('tab', { name: 'Join a Space' }));
    await user.type(screen.getByLabelText('Invitation code'), 'NOPE00');
    await user.press(screen.getByRole('button', { name: 'Join this Kin Space' }));

    expect(await screen.findByText('That invite could not be found. Check the code and try again.')).toBeTruthy();
    expect(screen.getByDisplayValue('NOPE00')).toBeTruthy();
  });
});
