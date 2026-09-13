import { screen, userEvent } from '@testing-library/react-native';
import { useState } from 'react';

import { ChatListScreen } from '@/features/chats/ChatListScreen';
import { OnboardingScreen } from '@/features/onboarding/OnboardingScreen';
import { CreateJoinSpaceScreen } from '@/features/spaces/CreateJoinSpaceScreen';
import { renderKin } from '../helpers/renderKin';

function ActivationJourney() {
  const [stage, setStage] = useState<'onboarding' | 'space' | 'chats'>('onboarding');
  if (stage === 'onboarding') {
    return <OnboardingScreen onComplete={() => setStage('space')} />;
  }
  if (stage === 'space') {
    return <CreateJoinSpaceScreen onSpaceReady={() => setStage('chats')} />;
  }
  return <ChatListScreen onNewSpace={jest.fn()} onOpenSpace={jest.fn()} />;
}

it('activates a clean install through profile, Space, and populated Chats', async () => {
  const user = userEvent.setup();
  await renderKin(<ActivationJourney />);

  await user.press(screen.getByRole('button', { name: 'See how Kin remembers' }));
  await user.press(screen.getByRole('button', { name: 'Create my profile' }));
  await user.type(screen.getByLabelText('Your name'), 'Maya');
  await user.press(screen.getByRole('button', { name: 'Continue' }));
  await user.type(screen.getByLabelText('Who is this Space with?'), 'Jamie');
  await user.press(screen.getByRole('button', { name: 'Create our Kin Space' }));

  expect(await screen.findByRole('button', { name: 'Open Kin Space with Jamie' })).toBeTruthy();
});
