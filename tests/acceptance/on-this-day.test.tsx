import { screen } from '@testing-library/react-native';

import { MomentsFeedScreen } from '@/features/moments/MomentsFeedScreen';
import { createTestRepository, renderKin } from '../helpers/renderKin';

it('surfaces one earlier-year match before recent memories without judgment language', async () => {
  const repository = createTestRepository();
  await repository.resetDemo();
  await renderKin(
    <MomentsFeedScreen onOpenMemory={jest.fn()} today="2026-09-13" />,
    repository,
  );

  expect(await screen.findByText('On this day')).toBeTruthy();
  expect(screen.getAllByText('Noodles after the rain').length).toBeGreaterThan(0);
  expect(screen.queryByText(/you used to|text less|declining|score/i)).toBeNull();
});
