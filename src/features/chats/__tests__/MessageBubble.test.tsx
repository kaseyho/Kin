import { render, screen } from '@testing-library/react-native';

import type { Message } from '@/domain/models';
import { MessageBubble } from '../MessageBubble';

const message: Message = {
  id: 'message-1',
  spaceId: 'space-1',
  senderId: 'maya',
  kind: 'text',
  body: 'A small thing worth remembering.',
  createdAt: '2026-09-13T08:00:00.000Z',
  reactions: [],
  deliveryState: 'failed',
};

it('labels message ownership and a recoverable failed state without color alone', async () => {
  await render(
    <MessageBubble
      currentUserId="maya"
      message={message}
      onOpenActions={jest.fn()}
      onRemove={jest.fn()}
      onRetry={jest.fn()}
      senderName="Maya"
    />,
  );

  expect(screen.getByLabelText('Your message: A small thing worth remembering. Actions available')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry message' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Remove failed message' })).toBeTruthy();
});
