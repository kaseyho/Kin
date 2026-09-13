import { screen, userEvent } from '@testing-library/react-native';

import { ChatScreen } from '@/features/chats/ChatScreen';
import { PersonalizeSpaceSheet } from '@/features/spaces/PersonalizeSpaceSheet';
import { createTestRepository, renderKin } from '../helpers/renderKin';

it('carries relationship-specific identity from personalization into the conversation', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  const user = userEvent.setup();
  const personalize = await renderKin(
    <PersonalizeSpaceSheet
      isKinPlus
      onClose={jest.fn()}
      onRequestKinPlus={jest.fn()}
      spaceId="space-maya-jamie"
    />,
    repository,
  );

  await user.clear(await screen.findByLabelText('Nickname'));
  await user.type(screen.getByLabelText('Nickname'), 'J');
  await user.press(screen.getByRole('button', { name: 'Evergreen theme' }));
  await user.press(screen.getByRole('button', { name: 'Save changes' }));
  await personalize.unmount();

  await renderKin(
    <ChatScreen
      mediaPicker={{ pickImage: async () => null }}
      onOpenRelationship={jest.fn()}
      spaceId="space-maya-jamie"
    />,
    repository,
  );
  expect(await screen.findByRole('button', { name: 'Relationship with J' })).toBeTruthy();
  expect(screen.getByTestId('chat-wallpaper')).toHaveStyle({ backgroundColor: '#E7F0EA' });
});
