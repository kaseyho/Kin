import { screen, userEvent } from '@testing-library/react-native';

import { ChatScreen } from '@/features/chats/ChatScreen';
import { createTestRepository, renderKin } from '../helpers/renderKin';

it('turns a conversation message into a private Moment and marks the source as kept', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  const user = userEvent.setup();
  await renderKin(
    <ChatScreen
      mediaPicker={{ pickImage: async () => null }}
      onOpenRelationship={jest.fn()}
      spaceId="space-maya-jamie"
    />,
    repository,
  );

  await user.longPress(await screen.findByLabelText(
    'Your message: December 5 was honestly the best first date. Actions available',
  ));
  await user.press(screen.getByRole('button', { name: 'Remember this' }));
  expect(screen.getByRole('button', { name: 'Remember as Important date' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remember as Plan' })).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Remember as Moment' }));
  expect(screen.getByText('Private to you')).toBeTruthy();
  await user.type(screen.getByLabelText('Title'), 'Our first date');
  await user.clear(screen.getByLabelText('Date'));
  await user.type(screen.getByLabelText('Date'), '2025-12-05');
  await user.press(screen.getByRole('button', { name: 'Keep this Moment' }));
  expect(await screen.findByText('Saved to your timeline')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Back to conversation' }));

  expect(await screen.findAllByLabelText('Kept as a Moment')).toHaveLength(2);
  expect((await repository.load()).memories.at(-1)?.sourceMessageIds).toEqual(['message-first-date']);
});
