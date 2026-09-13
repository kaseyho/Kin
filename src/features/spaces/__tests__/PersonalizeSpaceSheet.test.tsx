import { screen, userEvent } from '@testing-library/react-native';

import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { PersonalizeSpaceSheet } from '../PersonalizeSpaceSheet';
import { RelationshipPanel } from '../RelationshipPanel';

describe('PersonalizeSpaceSheet', () => {
  it('persists a nickname, accent, and wallpaper only for the selected relationship', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const otherSpace = await repository.createSpace({ otherDisplayName: 'Alex' });
    const user = userEvent.setup();
    const first = await renderKin(
      <PersonalizeSpaceSheet
        isKinPlus
        onClose={jest.fn()}
        onRequestKinPlus={jest.fn()}
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.clear(await screen.findByLabelText('Nickname'));
    await user.type(screen.getByLabelText('Nickname'), 'Jamie ♥');
    await user.press(screen.getByRole('button', { name: 'Moonlit theme' }));
    await user.press(screen.getByRole('button', { name: 'Constellations wallpaper' }));
    await user.press(screen.getByRole('button', { name: 'Save changes' }));
    await first.unmount();

    await renderKin(
      <RelationshipPanel
        onOpenKinPlus={jest.fn()}
        onOpenTimeline={jest.fn()}
        onSpaceUnavailable={jest.fn()}
        spaceId="space-maya-jamie"
        today="2026-09-13"
      />,
      repository,
    );
    expect(await screen.findByText('Jamie ♥')).toBeTruthy();
    expect(screen.getByText('Moonlit · Constellations')).toBeTruthy();

    const snapshot = await repository.load();
    expect(snapshot.spaces.find((space) => space.id === otherSpace.id)?.preferencesByUser.maya)
      .toMatchObject({ nickname: 'Alex', themeId: 'kin', wallpaperId: 'paper' });
  });

  it('previews premium expression but routes an unentitled save to Kin+', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const onRequestKinPlus = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <PersonalizeSpaceSheet
        onClose={jest.fn()}
        onRequestKinPlus={onRequestKinPlus}
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.press(await screen.findByRole('button', { name: 'Moonlit theme' }));
    expect(screen.getByText('Previewing Moonlit')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Save changes' }));

    expect(onRequestKinPlus).toHaveBeenCalledTimes(1);
    expect((await repository.load()).spaces[0].preferencesByUser.maya.themeId).toBe('kin');
  });
});
