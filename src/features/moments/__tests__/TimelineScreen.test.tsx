import { screen, userEvent } from '@testing-library/react-native';

import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { MomentDetailScreen } from '../MomentDetailScreen';
import { TimelineScreen } from '../TimelineScreen';

describe('relationship memories', () => {
  it('orders mixed saved items chronologically under stable year headings', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    await repository.saveMemory({
      kind: 'important_date',
      occurredOn: '2024-04-18',
      sourceMessageIds: [],
      spaceId: 'space-maya-jamie',
      title: 'The day we met',
    });
    await renderKin(
      <TimelineScreen onBack={jest.fn()} onOpenMemory={jest.fn()} spaceId="space-maya-jamie" />,
      repository,
    );

    expect(await screen.findAllByRole('header')).toEqual(expect.any(Array));
    const orderedIds = screen.getByTestId('timeline-list').children
      .filter((child): child is Exclude<typeof child, string> => typeof child !== 'string')
      .map((child) => child.props.testID)
      .filter((value): value is string => typeof value === 'string' && value.startsWith('timeline-item-'));
    expect(orderedIds).toEqual([
      'timeline-item-memory-1',
      'timeline-item-memory-lanterns',
      'timeline-item-plan-museum',
    ]);
    expect(screen.getByText('2024')).toBeTruthy();
    expect(screen.getByText('2025')).toBeTruthy();
    expect(screen.getByText('2026')).toBeTruthy();
  });

  it('shows source context, persists edits, and confirms permanent deletion', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const onDeleted = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <MomentDetailScreen memoryId="memory-lanterns" onBack={jest.fn()} onDeleted={onDeleted} />,
      repository,
    );

    expect(await screen.findByText('The noodle place we found after the rain')).toBeTruthy();
    expect(screen.getByText('Shared with Jamie')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Edit this Moment' }));
    await user.clear(screen.getByLabelText('Title'));
    await user.type(screen.getByLabelText('Title'), 'Noodle place, after rain');
    await user.press(screen.getByRole('button', { name: 'Save Moment changes' }));
    expect(await screen.findByText('Noodle place, after rain')).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Delete this Moment' }));
    await user.type(screen.getByLabelText('Type DELETE to confirm'), 'DELETE');
    await user.press(screen.getByRole('button', { name: 'Delete Moment permanently' }));
    expect((await repository.load()).memories.find((item) => item.id === 'memory-lanterns')).toBeUndefined();
    expect(onDeleted).toHaveBeenCalledTimes(1);
  });
});
