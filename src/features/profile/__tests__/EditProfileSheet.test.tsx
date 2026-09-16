import { screen, userEvent } from '@testing-library/react-native';

import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { EditProfileSheet } from '../EditProfileSheet';

describe('EditProfileSheet', () => {
  it('prefills and saves the current profile through the repository', async () => {
    const repository = createTestRepository();
    const seeded = await repository.resetDemo();
    const profile = seeded.profiles.find((item) => item.id === seeded.currentUserId)!;
    const onClose = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <EditProfileSheet onClose={onClose} profile={profile} visible />,
      repository,
    );

    expect(await screen.findByLabelText('Display name')).toHaveProp('value', 'Maya');
    await user.clear(screen.getByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Maya Chen');
    await user.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    const saved = await repository.load();
    expect(saved.profiles.find((item) => item.id === saved.currentUserId)?.displayName)
      .toBe('Maya Chen');
  });

  it('rejects a whitespace-only name without closing', async () => {
    const repository = createTestRepository();
    const seeded = await repository.resetDemo();
    const profile = seeded.profiles.find((item) => item.id === seeded.currentUserId)!;
    const onClose = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <EditProfileSheet onClose={onClose} profile={profile} visible />,
      repository,
    );
    await user.clear(await screen.findByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), '   ');

    await user.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Tell Kin what to call you.');
    expect(onClose).not.toHaveBeenCalled();
  });

  it('preserves the edited name after a save failure', async () => {
    const repository = createTestRepository();
    const seeded = await repository.resetDemo();
    const profile = seeded.profiles.find((item) => item.id === seeded.currentUserId)!;
    repository.saveProfile = jest.fn(async () => {
      throw new Error('provider secret');
    });
    const onClose = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <EditProfileSheet onClose={onClose} profile={profile} visible />,
      repository,
    );
    await user.clear(await screen.findByLabelText('Display name'));
    await user.type(screen.getByLabelText('Display name'), 'Maya Kept');

    await user.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Kin could not save your profile. Try again.');
    expect(screen.getByLabelText('Display name')).toHaveProp('value', 'Maya Kept');
    expect(onClose).not.toHaveBeenCalled();
  });
});
