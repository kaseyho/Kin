import { act, screen, userEvent, waitFor } from '@testing-library/react-native';

import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { SpaceSafetyActions } from '../SpaceSafetyActions';

async function renderActions(mode: 'connected' | 'demo' = 'demo') {
  const repository = createTestRepository();
  await repository.resetDemo();
  if (mode === 'connected') Object.assign(repository, { mode: 'connected' as const });
  const onReport = jest.fn();
  const onSpaceUnavailable = jest.fn();
  await renderKin(
    <SpaceSafetyActions
      onReport={onReport}
      onSpaceUnavailable={onSpaceUnavailable}
      partnerName="Jamie"
      spaceId="space-maya-jamie"
      userId="maya"
    />,
    repository,
  );
  return { onReport, onSpaceUnavailable, repository };
}

describe('SpaceSafetyActions', () => {
  it('keeps archive reversible and limits device-only deletion to demo mode', async () => {
    await renderActions('demo');

    expect(screen.getByText(/Archive hides this Space for you and can be reversed from Profile/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archive this Kin Space' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Delete local copy' })).toBeTruthy();
    expect(screen.getByText(/demo data on this device only/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Leave this Kin Space' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Block Jamie' })).toBeNull();
  });

  it('shows connected Leave, Block, and Report controls without local deletion', async () => {
    const { onReport } = await renderActions('connected');
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Leave this Kin Space' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Block Jamie' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Report this Kin Space' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete local copy' })).toBeNull();

    await user.press(screen.getByRole('button', { name: 'Report this Kin Space' }));
    expect(onReport).toHaveBeenCalledTimes(1);
  });

  it('explains permanent access loss before leaving and routes away after success', async () => {
    const { onSpaceUnavailable, repository } = await renderActions('connected');
    const leave = jest.spyOn(repository, 'leaveSpace');
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Leave this Kin Space' }));
    expect(screen.getByRole('header', { name: 'Leave this Kin Space?' })).toBeTruthy();
    expect(screen.getByText(/lose access to messages and shared history/i)).toBeTruthy();
    expect(screen.getByText(/private Memories/i)).toBeTruthy();
    expect(leave).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Confirm leave' }));
    await waitFor(() => expect(leave).toHaveBeenCalledWith({ spaceId: 'space-maya-jamie' }));
    expect(onSpaceUnavailable).toHaveBeenCalledTimes(1);
  });

  it('explains messaging and reconnection effects before blocking', async () => {
    const { onSpaceUnavailable, repository } = await renderActions('connected');
    const block = jest.spyOn(repository, 'blockSpaceMember');
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Block Jamie' }));
    expect(screen.getByRole('header', { name: 'Block Jamie?' })).toBeTruthy();
    expect(screen.getByText(/stops new messages and prevents you from reconnecting/i)).toBeTruthy();

    await user.press(screen.getByRole('button', { name: 'Confirm block' }));
    await waitFor(() => expect(block).toHaveBeenCalledWith({ spaceId: 'space-maya-jamie' }));
    expect(onSpaceUnavailable).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed Leave confirmation recoverable until retry succeeds', async () => {
    const { onSpaceUnavailable, repository } = await renderActions('connected');
    const originalLeave = repository.leaveSpace.bind(repository);
    const leave = jest.spyOn(repository, 'leaveSpace')
      .mockRejectedValueOnce(new Error('Connection interrupted.'))
      .mockImplementation(originalLeave);
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Leave this Kin Space' }));
    await user.press(screen.getByRole('button', { name: 'Confirm leave' }));
    expect(await screen.findByText('Connection interrupted.')).toBeTruthy();
    expect(onSpaceUnavailable).not.toHaveBeenCalled();

    await user.press(screen.getByRole('button', { name: 'Confirm leave' }));
    await waitFor(() => expect(leave).toHaveBeenCalledTimes(2));
    expect(onSpaceUnavailable).toHaveBeenCalledTimes(1);
  });

  it('locks every safety action while archive is in flight', async () => {
    const { repository } = await renderActions('connected');
    let finishArchive: (() => void) | undefined;
    jest.spyOn(repository, 'archiveSpace').mockImplementation(() => new Promise<void>((resolve) => {
      finishArchive = resolve;
    }));
    const user = userEvent.setup();

    await user.press(screen.getByRole('button', { name: 'Archive this Kin Space' }));

    expect(screen.getByRole('button', { name: 'Archiving…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Report this Kin Space' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Leave this Kin Space' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Block Jamie' })).toBeDisabled();

    await act(async () => finishArchive?.());
  });
});
