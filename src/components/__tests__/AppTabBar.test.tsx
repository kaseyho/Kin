import { fireEvent, render, screen } from '@testing-library/react-native';

import { AppTabBar } from '../AppTabBar';

describe('AppTabBar', () => {
  it('exposes the three relationship-first destinations', async () => {
    await render(<AppTabBar activeRoute="chats" onSelect={jest.fn()} />);

    expect(screen.getByRole('tab', { name: 'Chats' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Moments' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Profile' })).toBeTruthy();
  });

  it('reports the selected destination', async () => {
    const onSelect = jest.fn();
    await render(<AppTabBar activeRoute="chats" onSelect={onSelect} />);

    fireEvent.press(screen.getByRole('tab', { name: 'Moments' }));

    expect(onSelect).toHaveBeenCalledWith('moments');
  });
});
