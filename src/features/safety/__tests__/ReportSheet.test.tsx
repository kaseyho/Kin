import { screen, userEvent, waitFor } from '@testing-library/react-native';

import { createTestRepository, renderKin } from '../../../../tests/helpers/renderKin';
import { ReportSheet } from '../ReportSheet';

describe('ReportSheet', () => {
  it('requires a category, bounds optional details, and returns a message-report receipt', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    Object.assign(repository, { mode: 'connected' as const });
    const submit = jest.spyOn(repository, 'submitContentReport');
    const user = userEvent.setup();

    await renderKin(
      <ReportSheet
        messageId="message-3"
        onClose={jest.fn()}
        spaceId="space-maya-jamie"
        supportEmail="support@kin-app.com"
        visible
      />,
      repository,
    );

    await user.press(screen.getByRole('button', { name: 'Submit report' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a reason for this report.');

    await user.press(screen.getByRole('radio', { name: 'Harassment or bullying' }));
    expect(screen.getByLabelText('Optional report details')).toHaveProp('maxLength', 2_000);
    await user.type(screen.getByLabelText('Optional report details'), 'Repeated unwanted contact.');
    expect(screen.getByText('26 / 2,000')).toBeTruthy();
    await user.press(screen.getByRole('button', { name: 'Submit report' }));

    await waitFor(() => expect(submit).toHaveBeenCalledWith({
      category: 'harassment',
      explanation: 'Repeated unwanted contact.',
      messageId: 'message-3',
      spaceId: 'space-maya-jamie',
    }));
    expect(await screen.findByRole('header', { name: 'Report received' })).toBeTruthy();
    expect(screen.getByText(/Reference report-/)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Email Kin support at support@kin-app.com' })).toBeTruthy();
  });

  it('labels demo reports and unavailable support truthfully', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    const user = userEvent.setup();

    await renderKin(
      <ReportSheet
        onClose={jest.fn()}
        spaceId="space-maya-jamie"
        supportEmail="support@kin.invalid"
        visible
      />,
      repository,
    );

    expect(screen.getByText(/saved only on this device/i)).toBeTruthy();
    expect(screen.getByText(/not sent to Kin or a moderator/i)).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByText(/Support contact is not configured for this build/i)).toBeTruthy();

    await user.press(screen.getByRole('radio', { name: 'Something else' }));
    await user.press(screen.getByRole('button', { name: 'Save demo report' }));

    expect(await screen.findByRole('header', { name: 'Demo report saved' })).toBeTruthy();
    expect(screen.getByText(/stayed on this device/i)).toBeTruthy();
  });

  it('cannot be dismissed while a report submission is in flight', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    Object.assign(repository, { mode: 'connected' as const });
    let resolveReport: ((value: Awaited<ReturnType<typeof repository.submitContentReport>>) => void) | undefined;
    jest.spyOn(repository, 'submitContentReport').mockImplementation(() => new Promise((resolve) => {
      resolveReport = resolve;
    }));
    const onClose = jest.fn();
    const user = userEvent.setup();

    await renderKin(
      <ReportSheet
        onClose={onClose}
        spaceId="space-maya-jamie"
        supportEmail="support@kin-app.com"
        visible
      />,
      repository,
    );

    await user.press(screen.getByRole('radio', { name: 'Spam or scam' }));
    await user.press(screen.getByRole('button', { name: 'Submit report' }));

    const dismiss = screen.getByRole('button', { name: 'Cancel report' });
    expect(dismiss).toBeDisabled();
    await user.press(dismiss);
    expect(onClose).not.toHaveBeenCalled();

    resolveReport?.({ createdAt: '2026-09-13T08:00:00.000Z', id: 'report-pending', status: 'submitted' });
    expect(await screen.findByRole('header', { name: 'Report received' })).toBeTruthy();
  });

  it('preserves the report and offers an explicit retry after submission failure', async () => {
    const repository = createTestRepository();
    await repository.resetDemo();
    Object.assign(repository, { mode: 'connected' as const });
    const originalSubmit = repository.submitContentReport.bind(repository);
    jest.spyOn(repository, 'submitContentReport')
      .mockRejectedValueOnce(new Error('Safety service unavailable.'))
      .mockImplementation(originalSubmit);
    const user = userEvent.setup();

    await renderKin(
      <ReportSheet
        onClose={jest.fn()}
        spaceId="space-maya-jamie"
        supportEmail="support@kin-app.com"
        visible
      />,
      repository,
    );

    await user.press(screen.getByRole('radio', { name: 'Spam or scam' }));
    await user.type(screen.getByLabelText('Optional report details'), 'Suspicious links.');
    await user.press(screen.getByRole('button', { name: 'Submit report' }));

    expect(await screen.findByText('Safety service unavailable.')).toBeTruthy();
    expect(screen.getByLabelText('Optional report details')).toHaveProp('value', 'Suspicious links.');
    await user.press(screen.getByRole('button', { name: 'Try submitting again' }));
    expect(await screen.findByRole('header', { name: 'Report received' })).toBeTruthy();
  });
});
