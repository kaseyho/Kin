import { render, screen, userEvent } from '@testing-library/react-native';

import type { Message } from '@/domain/models';
import { MessageList } from '../MessageList';

const message: Message = {
  body: 'Latest message',
  createdAt: '2026-09-17T01:00:00.000Z',
  deliveryState: 'sent',
  id: 'message-1',
  kind: 'text',
  reactions: [],
  senderId: 'jamie',
  spaceId: 'space-1',
};

it('offers one explicit older-history action and reports loading state', async () => {
  const onLoadOlder = jest.fn();
  const user = userEvent.setup();
  const view = await render(
    <MessageList
      currentUserId="maya"
      hasOlderMessages
      messages={[message]}
      onLoadOlder={onLoadOlder}
      onOpenActions={jest.fn()}
      onRemove={jest.fn()}
      onRetry={jest.fn()}
      partnerName="Jamie"
    />,
  );

  await user.press(screen.getByRole('button', { name: 'Load earlier messages' }));
  expect(onLoadOlder).toHaveBeenCalledTimes(1);

  await view.rerender(
    <MessageList
      currentUserId="maya"
      hasOlderMessages
      historyStatus="loading"
      messages={[message]}
      onLoadOlder={onLoadOlder}
      onOpenActions={jest.fn()}
      onRemove={jest.fn()}
      onRetry={jest.fn()}
      partnerName="Jamie"
    />,
  );
  expect(screen.getByText('Loading earlier messages…')).toBeTruthy();
});
