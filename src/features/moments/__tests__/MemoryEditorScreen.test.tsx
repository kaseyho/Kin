import { screen, userEvent } from '@testing-library/react-native';

import { RepositoryError } from '@/data/errors';
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

  it('creates one client UUID for a draft and reuses it after a failed save', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const originalSave = repository.saveMemory.bind(repository);
    const saveMemory = jest
      .spyOn(repository, 'saveMemory')
      .mockRejectedValueOnce(new RepositoryError('save_failed', 'Kin could not keep that yet.', 'retry'))
      .mockImplementation(originalSave);
    const user = userEvent.setup();
    await renderKin(
      <MemoryEditorScreen
        kind="moment"
        onClose={jest.fn()}
        onRequestKinPlus={jest.fn()}
        onSaved={jest.fn()}
        sourceMessageId="message-3"
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.type(await screen.findByLabelText('Title'), 'Retry this memory');
    await user.press(screen.getByRole('button', { name: 'Keep this Moment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kin could not keep that yet.');
    await user.press(screen.getByRole('button', { name: 'Keep this Moment' }));

    expect(await screen.findByText('Saved to your timeline')).toBeTruthy();
    expect(saveMemory).toHaveBeenCalledTimes(2);
    const firstId = saveMemory.mock.calls[0]?.[0].clientMemoryId;
    const secondId = saveMemory.mock.calls[1]?.[0].clientMemoryId;
    expect(firstId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(secondId).toBe(firstId);
  });

  it('opens Kin+ for a server limit result and preserves the draft', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    jest.spyOn(repository, 'saveMemory').mockRejectedValue(
      new RepositoryError('memory_limit', 'Kin+ unlocks unlimited new Moments.'),
    );
    const onRequestKinPlus = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <MemoryEditorScreen
        isKinPlus
        kind="moment"
        onClose={jest.fn()}
        onRequestKinPlus={onRequestKinPlus}
        onSaved={jest.fn()}
        sourceMessageId="message-3"
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.type(await screen.findByLabelText('Title'), 'Keep my draft');
    await user.press(screen.getByRole('button', { name: 'Keep this Moment' }));

    expect(onRequestKinPlus).toHaveBeenCalledTimes(1);
    expect(screen.getByDisplayValue('Keep my draft')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('counts only memories owned by the current user for the local free-limit affordance', async () => {
    const base = createTestRepository();
    const snapshot = await base.resetDemo();
    const partnerMemory = { ...snapshot.memories[0], createdBy: 'jamie', visibility: 'shared' as const };
    const partnerMemories = Array.from({ length: 5 }, (_, index) => ({
      ...partnerMemory,
      id: `partner-memory-${index + 1}`,
    }));
    const saveMemory = jest.fn(async (input) => ({
      ...partnerMemory,
      createdBy: 'maya',
      id: input.clientMemoryId,
      sourceMessageIds: input.sourceMessageIds,
      title: input.title,
    }));
    const repository = Object.create(base) as typeof base;
    repository.load = async () => ({ ...snapshot, memories: partnerMemories });
    repository.subscribe = () => () => undefined;
    repository.saveMemory = saveMemory;
    const onRequestKinPlus = jest.fn();
    const user = userEvent.setup();
    await renderKin(
      <MemoryEditorScreen
        kind="moment"
        onClose={jest.fn()}
        onRequestKinPlus={onRequestKinPlus}
        onSaved={jest.fn()}
        sourceMessageId="message-3"
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.type(await screen.findByLabelText('Title'), 'My first owned memory');
    await user.press(screen.getByRole('button', { name: 'Keep this Moment' }));

    expect(saveMemory).toHaveBeenCalledTimes(1);
    expect(onRequestKinPlus).not.toHaveBeenCalled();
  });

  it('keeps a hard in-flight lock when the save button is pressed twice', async () => {
    const repository = createTestRepository();
    const snapshot = await repository.resetDemo();
    let resolveSave: ((memory: (typeof snapshot.memories)[number]) => void) | undefined;
    const saveMemory = jest.spyOn(repository, 'saveMemory').mockImplementation((input) =>
      new Promise((resolve) => {
        resolveSave = resolve;
      }).then(() => ({
        ...snapshot.memories[0],
        id: input.clientMemoryId,
        title: input.title,
      })));
    const user = userEvent.setup();
    await renderKin(
      <MemoryEditorScreen
        kind="moment"
        onClose={jest.fn()}
        onRequestKinPlus={jest.fn()}
        onSaved={jest.fn()}
        sourceMessageId="message-3"
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.type(await screen.findByLabelText('Title'), 'Only once');
    const button = screen.getByRole('button', { name: 'Keep this Moment' });
    await user.press(button);
    await user.press(button);

    expect(saveMemory).toHaveBeenCalledTimes(1);
    resolveSave?.(snapshot.memories[0]);
    expect(await screen.findByText('Saved to your timeline')).toBeTruthy();
  });
});
