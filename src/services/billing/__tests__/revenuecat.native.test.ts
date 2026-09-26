import { Linking } from 'react-native';

const mockConfigure = jest.fn();
const mockGetCustomerInfo = jest.fn();
const mockGetOfferings = jest.fn();
const mockLogIn = jest.fn();
const mockLogOut = jest.fn();
const mockPurchasePackage = jest.fn();
const mockRestorePurchases = jest.fn();
const mockAddCustomerInfoUpdateListener = jest.fn();
const mockRemoveCustomerInfoUpdateListener = jest.fn();
const mockGetAppUserID = jest.fn();
const mockOpenUrl = jest.fn();
const mockPresentCustomerCenter = jest.fn();

const mockPurchases = {
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: 'PURCHASE_CANCELLED_ERROR' },
  addCustomerInfoUpdateListener: mockAddCustomerInfoUpdateListener,
  configure: mockConfigure,
  getAppUserID: mockGetAppUserID,
  getCustomerInfo: mockGetCustomerInfo,
  getOfferings: mockGetOfferings,
  logIn: mockLogIn,
  logOut: mockLogOut,
  purchasePackage: mockPurchasePackage,
  removeCustomerInfoUpdateListener: mockRemoveCustomerInfoUpdateListener,
  restorePurchases: mockRestorePurchases,
};

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: mockPurchases,
}));

jest.mock('react-native-purchases-ui', () => ({
  __esModule: true,
  default: { presentCustomerCenter: mockPresentCustomerCenter },
}));

jest.spyOn(Linking, 'openURL').mockImplementation(mockOpenUrl);

function loadFactory() {
  // The provider module must load after its native SDK double is initialized.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../revenuecat.native')
    .createRevenueCatPremiumService as typeof import('../revenuecat.native').createRevenueCatPremiumService;
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
        ? { kin_plus: { expirationDate: '2027-09-26T00:00:00.000Z' } }
        : {},
    },
    managementURL,
  };
}

function nativePackage() {
  return {
    identifier: 'monthly-dashboard',
    product: {
      defaultOption: {
        freePhase: { billingPeriod: { iso8601: 'P7D' } },
      },
      introPrice: null,
      priceString: '$4.99',
      subscriptionPeriod: 'P1M',
      title: 'Monthly together',
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCustomerInfo.mockResolvedValue(customerInfo());
  mockGetOfferings.mockResolvedValue({ current: null });
  mockLogIn.mockImplementation(async () => ({ customerInfo: customerInfo() }));
  mockLogOut.mockResolvedValue(customerInfo());
  mockPurchasePackage.mockResolvedValue({ customerInfo: customerInfo({ active: true }) });
  mockRestorePurchases.mockResolvedValue(customerInfo());
  mockGetAppUserID.mockResolvedValue(USER_A);
  mockOpenUrl.mockResolvedValue(undefined);
  mockPresentCustomerCenter.mockResolvedValue(undefined);
});

it('does not touch the native SDK before an authenticated user is active', async () => {
  const service = loadFactory()('appl_public');

  expect(await service.getEntitlement()).toMatchObject({ isKinPlus: false });
  expect(await service.getOffering()).toBeNull();
  await expect(service.purchase('monthly')).rejects.toMatchObject({ code: 'unavailable' });
  await expect(service.restore()).rejects.toMatchObject({ code: 'unavailable' });
  await expect(service.manageSubscription()).rejects.toMatchObject({ code: 'unavailable' });

  expect(mockConfigure).not.toHaveBeenCalled();
  expect(mockGetCustomerInfo).not.toHaveBeenCalled();
  expect(mockGetOfferings).not.toHaveBeenCalled();
  expect(mockPurchasePackage).not.toHaveBeenCalled();
  expect(mockRestorePurchases).not.toHaveBeenCalled();
});

it('configures once with the first Supabase UUID, switches with logIn, and clears before logOut', async () => {
  mockGetCustomerInfo.mockResolvedValue(customerInfo({
    active: true,
    managementURL: 'https://apps.apple.com/account/subscriptions',
  }));
  mockLogIn.mockResolvedValue({ customerInfo: customerInfo() });
  const service = loadFactory()('appl_public');
  const listener = jest.fn();
  service.subscribe(listener);

  await expect(service.activateUser(USER_A)).resolves.toEqual({
    canManageSubscription: true,
    expiresAt: '2027-09-26T00:00:00.000Z',
    isKinPlus: true,
    source: 'revenuecat',
  });
  expect(mockConfigure).toHaveBeenCalledTimes(1);
  expect(mockConfigure).toHaveBeenCalledWith({ apiKey: 'appl_public', appUserID: USER_A });

  await service.activateUser(USER_B);
  expect(mockConfigure).toHaveBeenCalledTimes(1);
  expect(mockLogIn).toHaveBeenCalledWith(USER_B);

  const pending = service.deactivateUser();
  expect(await service.getEntitlement()).toEqual({
    canManageSubscription: false,
    isKinPlus: false,
    source: 'unavailable',
  });
  expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ isKinPlus: false }));
  await pending;
  expect(mockLogOut).toHaveBeenCalledTimes(1);
});

it('keeps dashboard packages private and purchases the exact loaded native object', async () => {
  const item = nativePackage();
  mockGetOfferings.mockResolvedValue({
    current: { availablePackages: [item], identifier: 'default-dashboard' },
  });
  const service = loadFactory()('appl_public');
  await service.activateUser(USER_A);

  await expect(service.getOffering()).resolves.toEqual({
    id: 'default-dashboard',
    packages: [{
      billingPeriodLabel: 'per month',
      id: 'monthly-dashboard',
      priceLabel: '$4.99',
      title: 'Monthly together',
      trialLabel: '7-day free trial',
    }],
  });
  await service.purchase('monthly-dashboard');

  expect(mockPurchasePackage).toHaveBeenCalledWith(item);
});

it('maps cancellation and provider failures to stable Kin-authored errors', async () => {
  const item = nativePackage();
  mockGetOfferings.mockResolvedValue({
    current: { availablePackages: [item], identifier: 'default-dashboard' },
  });
  const service = loadFactory()('appl_public');
  await service.activateUser(USER_A);
  await service.getOffering();

  mockPurchasePackage.mockRejectedValueOnce({
    code: 'PURCHASE_CANCELLED_ERROR',
    message: 'raw receipt and provider detail',
  });
  await expect(service.purchase('monthly-dashboard')).rejects.toMatchObject({
    code: 'cancelled',
    message: 'Purchase cancelled.',
  });

  mockGetOfferings.mockRejectedValueOnce(new Error('raw provider failure'));
  await expect(service.getOffering()).rejects.toMatchObject({
    code: 'offering_failed',
    message: 'Kin could not load purchase options.',
  });
});

it('opens only https management URLs and falls back to native Customer Center when absent', async () => {
  mockGetCustomerInfo.mockResolvedValue(customerInfo({
    active: true,
    managementURL: 'https://apps.apple.com/account/subscriptions',
  }));
  const service = loadFactory()('appl_public');
  await service.activateUser(USER_A);

  await service.manageSubscription();
  expect(mockOpenUrl).toHaveBeenCalledWith('https://apps.apple.com/account/subscriptions');

  mockLogIn.mockResolvedValue({ customerInfo: customerInfo({ active: true }) });
  await service.activateUser(USER_B);
  await service.manageSubscription();
  expect(mockPresentCustomerCenter).toHaveBeenCalledTimes(1);

  mockLogIn.mockResolvedValue({
    customerInfo: customerInfo({ active: true, managementURL: 'javascript:alert(1)' }),
  });
  await service.activateUser(USER_A);
  await expect(service.manageSubscription()).rejects.toMatchObject({ code: 'management_failed' });
  expect(mockOpenUrl).toHaveBeenCalledTimes(1);
});
