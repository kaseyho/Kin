import { screen, userEvent } from '@testing-library/react-native';

import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { MemoryEditorScreen } from '../MemoryEditorScreen';

describe('MemoryEditorScreen', () => {
  it('turns a source message into a private Moment and shows its saved state', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const onSaved = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <MemoryEditorScreen
        kind="moment"
        onClose={jest.fn()}
        onRequestKinPlus={jest.fn()}
        onSaved={onSaved}
        sourceMessageId="message-3"
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    expect(await screen.findByText('Private to you')).toBeTruthy();
    expect(screen.getByText('I was trying to impress you.')).toBeTruthy();
    await user.type(screen.getByLabelText('Title'), 'Our first date');
    await user.press(screen.getByRole('button', { name: 'Keep this Moment' }));

    expect(await screen.findByText('Saved to your timeline')).toBeTruthy();
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ title: 'Our first date' }));
    expect((await repository.load()).memories.at(-1)).toMatchObject({
      kind: 'moment',
      sourceMessageIds: ['message-3'],
      visibility: 'private',
    });
  });

  it('keeps entered content visible after inline validation fails', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const user = userEvent.setup();
    await renderKin(
      <MemoryEditorScreen
        kind="plan"
        onClose={jest.fn()}
        onRequestKinPlus={jest.fn()}
        onSaved={jest.fn()}
        sourceMessageId="message-7"
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.type(await screen.findByLabelText('Title'), 'Saturday dinner');
    await user.clear(screen.getByLabelText('Date'));
    await user.type(screen.getByLabelText('Date'), 'not-a-date');
    await user.press(screen.getByRole('button', { name: 'Save plan' }));

    expect(screen.getByRole('alert')).toHaveTextContent(/valid date/);
    expect(screen.getByDisplayValue('Saturday dinner')).toBeTruthy();
  });
});
