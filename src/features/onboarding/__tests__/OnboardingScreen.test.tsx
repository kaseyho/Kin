import { screen, userEvent } from '@testing-library/react-native';

import { renderKin } from '../../../../tests/helpers/renderKin';
import { OnboardingScreen } from '../OnboardingScreen';

describe('OnboardingScreen', () => {
  it('explains Kin before creating a human profile', async () => {
    const onComplete = jest.fn();
    const user = userEvent.setup();
    await renderKin(<OnboardingScreen onComplete={onComplete} />);

    expect(screen.getByText('Your chats contain more than messages.')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'See how Kin remembers' }));
    expect(screen.getByText('The good parts deserve somewhere to live.')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Create my profile' }));

    await user.type(screen.getByLabelText('Your name'), 'Maya');
    await user.press(screen.getByRole('button', { name: 'Continue' }));

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('opens the seeded story only through the explicit demo action', async () => {
    const onTryDemo = jest.fn();
    const user = userEvent.setup();
    await renderKin(<OnboardingScreen onComplete={jest.fn()} onTryDemo={onTryDemo} />);

    await user.press(screen.getByRole('button', { name: 'Try Maya and Jamie’s demo' }));

    expect(onTryDemo).toHaveBeenCalledTimes(1);
  });
});
