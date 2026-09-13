import { screen, userEvent } from '@testing-library/react-native';

import { ChatScreen } from '@/features/chats/ChatScreen';
import { createTestRepository, renderKin } from '../helpers/renderKin';

it('keeps messaging familiar while relationship actions remain one level deeper', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  const onOpenRelationship = jest.fn();
  const user = userEvent.setup();
  await renderKin(
    <ChatScreen
      mediaPicker={{ pickImage: async () => null }}
      onOpenRelationship={onOpenRelationship}
      spaceId="space-maya-jamie"
    />,
    repository,
  );

  await user.type(await screen.findByLabelText('Message Jamie'), 'Saturday at seven?');
  await user.press(screen.getByRole('button', { name: 'Send' }));
  await user.press(screen.getByRole('button', { name: 'Relationship with Jamie' }));

  expect(screen.getByText('Saturday at seven?')).toBeTruthy();
  expect(onOpenRelationship).toHaveBeenCalledTimes(1);
});
