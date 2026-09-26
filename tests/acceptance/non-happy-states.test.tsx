import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import type { StorageAdapter } from '@/data/contracts';
import { createDemoKinRepository } from '@/data/demo/DemoKinRepository';
import { ChatListScreen } from '@/features/chats/ChatListScreen';
import { ChatScreen } from '@/features/chats/ChatScreen';
import { MemoryEditorScreen } from '@/features/moments/MemoryEditorScreen';
import { MomentsFeedScreen } from '@/features/moments/MomentsFeedScreen';
import { KinPlusScreen } from '@/features/premium/KinPlusScreen';
import { PremiumProvider } from '@/features/premium/PremiumProvider';
import { CreateJoinSpaceScreen } from '@/features/spaces/CreateJoinSpaceScreen';
import { BillingError, type PremiumService } from '@/services/billing/contracts';
import { MediaPermissionError, type MediaPicker } from '@/services/media/contracts';
import { createTestRepository, renderKin } from '../helpers/renderKin';

describe('non-happy product states', () => {
  it('preserves a corrupt local snapshot until the person explicitly resets it', async () => {
    let stored = '{not valid json';
    const storage: StorageAdapter = {
      getItem: async () => stored,
      removeItem: async () => { stored = ''; },
      setItem: async (_key, value) => { stored = value; },
    };
    const repository = createDemoKinRepository(storage);
    const user = userEvent.setup();
    await renderKin(<ChatListScreen onNewSpace={jest.fn()} onOpenSpace={jest.fn()} />, repository);

    expect(await screen.findByText('This copy needs a fresh start')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Reset the demo safely' }));
    expect(await screen.findByRole('button', { name: 'Open Kin Space with Jamie' })).toBeTruthy();
  });

  it('keeps a failed send in place and gives denied photo access one direct recovery action', async () => {
    let failNext = true;
    const repository = createTestRepository({
      failNextSend: () => {
        const shouldFail = failNext;
        failNext = false;
        return shouldFail;
      },
    });
    await repository.resetDemo();
    const deniedPicker: MediaPicker = {
      pickImage: async () => { throw new MediaPermissionError(); },
    };
    const user = userEvent.setup();
    await renderKin(
      <ChatScreen
        mediaPicker={deniedPicker}
        onOpenRelationship={jest.fn()}
        spaceId="space-maya-jamie"
      />,
      repository,
    );

    await user.press(await screen.findByRole('button', { name: 'Send a photo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Photo access is off/);
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy();

    await user.type(screen.getByLabelText('Message Jamie'), 'Save me a seat');
    await user.press(screen.getByRole('button', { name: 'Send' }));
    await user.press(await screen.findByRole('button', { name: 'Retry message' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Retry message' })).toBeNull());
    expect(screen.getAllByText('Save me a seat')).toHaveLength(1);
  });

  it('keeps an invalid invitation editable after rejection', async () => {
    const repository = createTestRepository();
    await repository.saveProfile({ avatarUri: '', displayName: 'Maya' });
    const user = userEvent.setup();
    await renderKin(<CreateJoinSpaceScreen onSpaceReady={jest.fn()} />, repository);

    await user.press(screen.getByRole('tab', { name: 'Join a Space' }));
    await user.type(screen.getByLabelText('Invitation code'), 'NOPE00');
    await user.press(screen.getByRole('button', { name: 'Join this Kin Space' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/Check the code and try again/);
    expect(screen.getByDisplayValue('NOPE00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Join this Kin Space' })).toBeTruthy();
  });

  it('retains Moment input after validation and gives empty Chats and Moments a clear next step', async () => {
    const emptyRepository = createTestRepository();
    await emptyRepository.saveProfile({ avatarUri: '', displayName: 'Maya' });
    const chats = await renderKin(
      <ChatListScreen onNewSpace={jest.fn()} onOpenSpace={jest.fn()} />,
      emptyRepository,
    );
    expect(await screen.findByRole('button', { name: 'Create your first Kin Space' })).toBeTruthy();
    await chats.unmount();

    const moments = await renderKin(<MomentsFeedScreen onOpenMemory={jest.fn()} />, emptyRepository);
    expect(await screen.findByText('Long-press a message and choose Remember this to begin.')).toBeTruthy();
    await moments.unmount();

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
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid date/);
    expect(screen.getByDisplayValue('Saturday dinner')).toBeTruthy();
  });

  it('explains unavailable billing and leaves Restore as the recovery action', async () => {
    const unavailable: PremiumService = {
      activateUser: async () => ({ isKinPlus: false, source: 'unavailable' }),
      deactivateUser: async () => undefined,
      getEntitlement: async () => ({ isKinPlus: false, source: 'unavailable' }),
      getOffering: async () => null,
      manageSubscription: async () => undefined,
      purchase: async () => { throw new BillingError('unavailable', 'Billing unavailable'); },
      restore: async () => ({ isKinPlus: false, source: 'unavailable' }),
      subscribe: () => () => undefined,
    };
    await render(
      <PremiumProvider service={unavailable}>
        <KinPlusScreen onClose={jest.fn()} />
      </PremiumProvider>,
    );

    expect(await screen.findByText('Purchases need a configured development build')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Restore purchases' })).toBeTruthy();
  });

  it('treats cancellation quietly, exposes purchase retry, and reports an empty restore', async () => {
    let attempts = 0;
    const service: PremiumService = {
      activateUser: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      deactivateUser: async () => undefined,
      getEntitlement: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      getOffering: async () => ({
        id: 'default',
        packages: [{ id: 'monthly', priceLabel: '$3.99', title: 'Monthly' }],
      }),
      manageSubscription: async () => undefined,
      purchase: async () => {
        attempts += 1;
        throw new BillingError(attempts === 1 ? 'cancelled' : 'purchase_failed', 'Could not finish purchase');
      },
      restore: async () => ({ isKinPlus: false, source: 'revenuecat' }),
      subscribe: () => () => undefined,
    };
    const user = userEvent.setup();
    await render(
      <PremiumProvider service={service}>
        <KinPlusScreen onClose={jest.fn()} />
      </PremiumProvider>,
    );

    const buy = await screen.findByRole('button', { name: 'Choose Monthly, $3.99' });
    await user.press(buy);
    expect(screen.queryByRole('alert')).toBeNull();
    await user.press(buy);
    expect(await screen.findByRole('button', { name: 'Retry purchase' })).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Restore purchases' }));
    expect(await screen.findByText('No active Kin+ purchase found.')).toBeTruthy();
  });
});
