import { render, screen, userEvent } from '@testing-library/react-native';

import { OnThisDayCard } from '../OnThisDayCard';

const memory = {
  id: 'first-date',
  spaceId: 'space-1',
  createdBy: 'maya',
  kind: 'moment' as const,
  visibility: 'private' as const,
  title: 'Our first date',
  occurredOn: '2025-12-05' as const,
  note: 'Warm noodles and no awkward silences.',
  sourceMessageIds: ['message-1'],
  mediaUris: [],
  createdAt: '2025-12-05T13:00:00.000Z',
  updatedAt: '2025-12-05T13:00:00.000Z',
};

it('opens the canonical saved item with source attribution', async () => {
  const onOpen = jest.fn();
  const user = userEvent.setup();
  await render(<OnThisDayCard memory={memory} onOpen={onOpen} partnerName="Jamie" />);

  expect(screen.getByText('On this day')).toBeTruthy();
  expect(screen.getByText('From your message with Jamie')).toBeTruthy();
  await user.press(screen.getByRole('button', { name: 'Open Our first date' }));
  expect(onOpen).toHaveBeenCalledWith('first-date');
});
