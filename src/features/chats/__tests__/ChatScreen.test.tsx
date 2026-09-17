import { fireEvent, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { MediaPicker } from '@/services/media/contracts';
import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { ChatScreen } from '../ChatScreen';

const cancelledPicker: MediaPicker = {
  pickImage: async () => null,
};

async function renderDemoChat(
  options: {
    mediaPicker?: MediaPicker;
    onRemember?: (messageId: string) => void;
    repository?: ReturnType<typeof createTestRepository>;
  } = {},
) {
  const repository = options.repository ?? createTestRepository();
  await repository.resetDemo();
  await renderKin(
    <ChatScreen
      mediaPicker={options.mediaPicker ?? cancelledPicker}
      onOpenRelationship={jest.fn()}
      onRemember={options.onRemember}
      spaceId="space-maya-jamie"
    />,
    repository,
  );
  await screen.findByText('Jamie');
  return repository;
}

describe('ChatScreen', () => {
  it('shows received history and sends a text message with a timestamp', async () => {
    const user = userEvent.setup();
    await renderDemoChat();

    expect(screen.getByText('I was trying to impress you.')).toBeTruthy();
    await user.type(screen.getByLabelText('Message Jamie'), 'What about Saturday at seven?');
    await user.press(screen.getByRole('button', { name: 'Send' }));

    expect(await screen.findByText('What about Saturday at seven?')).toBeTruthy();
    expect((await screen.findAllByLabelText('Sent')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('4:00 PM').length).toBeGreaterThan(0);
  });

  it('keeps a failed send in place and retries without duplication', async () => {
    let fail = true;
    const repository = createTestRepository({
      failNextSend: () => {
        const result = fail;
        fail = false;
        return result;
      },
    });
    const user = userEvent.setup();
    await renderDemoChat({ repository });

    await user.type(screen.getByLabelText('Message Jamie'), 'Save me a seat');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    await user.press(await screen.findByRole('button', { name: 'Retry message' }));

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retry message' })).toBeNull(),
    );
    expect(screen.getAllByText('Save me a seat')).toHaveLength(1);
  });

  it('removes a failed send separately from retrying it', async () => {
    const repository = createTestRepository({ failNextSend: () => true });
    const user = userEvent.setup();
    await renderDemoChat({ repository });

    await user.type(screen.getByLabelText('Message Jamie'), 'Discard this');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    await user.press(await screen.findByRole('button', { name: 'Remove failed message' }));

    await waitFor(() => expect(screen.queryByText('Discard this')).toBeNull());
  });

  it('marks partner messages read when the conversation opens', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const markSpaceRead = jest.spyOn(repository, 'markSpaceRead');

    await renderKin(
      <ChatScreen
        mediaPicker={cancelledPicker}
        onOpenRelationship={jest.fn()}
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await waitFor(() => expect(markSpaceRead).toHaveBeenCalledWith('space-maya-jamie'));
    expect((await repository.load()).unreadCounts['space-maya-jamie']).toBe(0);
  });

  it('sends a selected image and leaves text messaging usable after cancellation', async () => {
    const selectedPicker: MediaPicker = {
      pickImage: async () => ({
        uri: 'file:///date-night.jpg',
        width: 1200,
        height: 900,
        mimeType: 'image/jpeg',
      }),
    };
    const user = userEvent.setup();
    const repository = await renderDemoChat({ mediaPicker: selectedPicker });

    await user.press(screen.getByRole('button', { name: 'Send a photo' }));
    expect(await screen.findByLabelText('Image message: Shared photo')).toBeTruthy();
    expect((await repository.load()).messages.at(-1)).toMatchObject({
      kind: 'image',
      mediaUri: 'file:///date-night.jpg',
    });
  });

  it('sends the relationship sticker through the ordinary message path', async () => {
    const user = userEvent.setup();
    const repository = await renderDemoChat();

    await user.press(screen.getByRole('button', { name: 'Open relationship stickers' }));
    await user.press(screen.getByRole('button', { name: 'Send Jamie cooking sticker' }));

    expect(await screen.findByLabelText('Sticker message: Jamie cooking')).toBeTruthy();
    expect((await repository.load()).messages.at(-1)?.kind).toBe('sticker');
  });

  it('reacts and exposes Remember this through long-press and accessibility', async () => {
    const onRemember = jest.fn();
    const user = userEvent.setup();
    await renderDemoChat({ onRemember });
    const message = screen.getByLabelText(
      'Message from Jamie: I was trying to impress you. Actions available',
    );

    await user.longPress(message);
    await user.press(screen.getByRole('button', { name: 'React with heart' }));
    await waitFor(() => expect(screen.getAllByText('❤️ 1')).toHaveLength(2));

    const updatedMessage = screen.getByLabelText(
      'Message from Jamie: I was trying to impress you. Actions available',
    );
    await fireEvent(updatedMessage, 'accessibilityAction', {
      nativeEvent: { actionName: 'activate' },
    });
    await user.press(screen.getByRole('button', { name: 'Remember this' }));

    await waitFor(() => expect(onRemember).toHaveBeenCalledWith('message-3'));
  });

  it('reports a received message without exposing internal person identifiers', async () => {
    const user = userEvent.setup();
    const repository = await renderDemoChat();
    const submit = jest.spyOn(repository, 'submitContentReport');

    await user.longPress(screen.getByLabelText(
      'Message from Jamie: I was trying to impress you. Actions available',
    ));
    await user.press(screen.getByRole('button', { name: 'Report this message' }));

    expect(screen.getByRole('header', { name: 'Report this message' })).toBeTruthy();
    expect(screen.queryByText('message-3')).toBeNull();
    expect(screen.queryByText('jamie')).toBeNull();
    expect(screen.getByText(/Demo reports are saved only on this device/i)).toBeTruthy();
    expect(screen.getByText(/Support contact is not configured for this build/i)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();

    await user.press(screen.getByRole('radio', { name: 'Threats or violence' }));
    await user.press(screen.getByRole('button', { name: 'Save demo report' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      category: 'threats',
      explanation: '',
      messageId: 'message-3',
      spaceId: 'space-maya-jamie',
    }));
    expect(await screen.findByRole('header', { name: 'Demo report saved' })).toBeTruthy();
  });
});
