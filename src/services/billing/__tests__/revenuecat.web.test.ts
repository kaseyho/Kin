import { Linking } from 'react-native';

const mockConfigure = jest.fn();
const mockChangeUser = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockGetOfferings = jest.fn();
const mockPurchase = jest.fn();
const mockOpenUrl = jest.fn();

const mockWebInstance = {
  changeUser: mockChangeUser,
  getCustomerInfo: mockGetCustomerInfo,
  getOfferings: mockGetOfferings,
  purchase: mockPurchase,
};

jest.mock('@revenuecat/purchases-js', () => ({
  ErrorCode: { UserCancelledError: 1 },
  Purchases: { configure: mockConfigure },
}));

jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenUrl);

function loadFactory() {
  // The provider module must load after its browser SDK double is initialized.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../revenuecat.web')
    .createRevenueCatPremiumService as typeof import('../revenuecat.web').createRevenueCatPremiumService;
}

const USER_A = '10000000-0000-0000-0000-000000000001';
const USER_B = '10000000-0000-0000-0000-000000000002';

function customerInfo({
  active = false,
  managementURL = null,
}: { active?: boolean; managementURL?: string | null } = {}) {
  return {
    entitlements: {
      active: active
        ? { kin_plus: { expirationDate: new Date('2027-09-26T00:00:00.000Z') } }
        : {},
    },
    managementURL,
  };
}

function webPackage() {
  return {
    identifier: 'annual-dashboard',
    webBillingProduct: {
      freeTrialPhase: { periodDuration: 'P14D' },
      normalPeriodDuration: 'P1Y',
      price: { formattedPrice: 'S$49.99' },
      title: 'A year together',
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockConfigure.mockReturnValue(mockWebInstance);
  mockGetCustomerInfo.mockResolvedValue(customerInfo());
  mockGetOfferings.mockResolvedValue({ current: null });
  mockChangeUser.mockResolvedValue(customerInfo());
  mockPurchase.mockResolvedValue({ customerInfo: customerInfo({ active: true }) });
  mockOpenUrl.mockResolvedValue(undefined);
});

it('does not configure or call the web SDK before an authenticated user is active', async () => {
  const service = loadFactory()('rcb_public');

  expect(await service.getEntitlement()).toMatchObject({ isKinPlus: false });
  expect(await service.getOffering()).toBeNull();
  await expect(service.purchase('annual')).rejects.toMatchObject({ code: 'unavailable' });
  await expect(service.restore()).rejects.toMatchObject({ code: 'unavailable' });
  await expect(service.manageSubscription()).rejects.toMatchObject({ code: 'unavailable' });

  expect(mockConfigure).not.toHaveBeenCalled();
  expect(mockGetCustomerInfo).not.toHaveBeenCalled();
  expect(mockGetOfferings).not.toHaveBeenCalled();
  expect(mockPurchase).not.toHaveBeenCalled();
});

it('configures once with the first Supabase UUID, changes users, and clears synchronously', async () => {
  mockGetCustomerInfo.mockResolvedValue(customerInfo({
    active: true,
    managementURL: 'https://pay.rev.cat/portal/customer',
  }));
  const service = loadFactory()('rcb_public');
  const listener = jest.fn();
  service.subscribe(listener);

  await expect(service.activateUser(USER_A)).resolves.toEqual({
    canManageSubscription: true,
    expiresAt: '2027-09-26T00:00:00.000Z',
    isKinPlus: true,
    source: 'revenuecat',
  });
  expect(mockConfigure).toHaveBeenCalledWith({ apiKey: 'rcb_public', appUserId: USER_A });

  await service.activateUser(USER_B);
  expect(mockConfigure).toHaveBeenCalledTimes(1);
  expect(mockChangeUser).toHaveBeenCalledWith(USER_B);

  const pending = service.deactivateUser();
  expect(await service.getEntitlement()).toEqual({
    canManageSubscription: false,
    isKinPlus: false,
    source: 'unavailable',
  });
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ isKinPlus: false }));
  await pending;
});

it('exposes dashboard metadata and purchases the exact loaded web package', async () => {
  const item = webPackage();
  mockGetOfferings.mockResolvedValue({
    current: { availablePackages: [item], identifier: 'web-default' },
  });
  const service = loadFactory()('rcb_public');
  await service.activateUser(USER_A);

  await expect(service.getOffering()).resolves.toEqual({
    id: 'web-default',
    packages: [{
      billingPeriodLabel: 'per year',
      id: 'annual-dashboard',
      priceLabel: 'S$49.99',
      title: 'A year together',
      trialLabel: '14-day free trial',
    }],
  });
  await service.purchase('annual-dashboard');

  expect(mockPurchase).toHaveBeenCalledWith({ rcPackage: item });
});

it('refreshes identified Customer Info for restore and maps cancellation without leaking details', async () => {
  const item = webPackage();
  mockGetOfferings.mockResolvedValue({
    current: { availablePackages: [item], identifier: 'web-default' },
  });
  const service = loadFactory()('rcb_public');
  await service.activateUser(USER_A);
  await service.getOffering();
  mockGetCustomerInfo.mockClear();

  await service.restore();
  expect(mockGetCustomerInfo).toHaveBeenCalledTimes(1);

  mockPurchase.mockRejectedValueOnce({
    errorCode: 1,
    message: 'raw checkout token and provider detail',
  });
  await expect(service.purchase('annual-dashboard')).rejects.toMatchObject({
    code: 'cancelled',
    message: 'Purchase cancelled.',
  });
});

it('opens only https customer portal URLs and reports missing management configuration', async () => {
  mockGetCustomerInfo.mockResolvedValue(customerInfo({
    active: true,
    managementURL: 'https://pay.rev.cat/portal/customer',
  }));
  const service = loadFactory()('rcb_public');
  await service.activateUser(USER_A);
  await service.manageSubscription();
  expect(mockOpenUrl).toHaveBeenCalledWith('https://pay.rev.cat/portal/customer');

  mockChangeUser.mockResolvedValue(customerInfo({ active: true }));
  await service.activateUser(USER_B);
  await expect(service.manageSubscription()).rejects.toMatchObject({
    code: 'management_failed',
    message: 'Kin could not open subscription management.',
  });

  mockChangeUser.mockResolvedValue({
    ...customerInfo({ active: true }),
    managementURL: 'javascript:alert(1)',
  });
  await service.activateUser(USER_A);
  await expect(service.manageSubscription()).rejects.toMatchObject({ code: 'management_failed' });
  expect(mockOpenUrl).toHaveBeenCalledTimes(1);
});
