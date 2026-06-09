import { DuplicateCustomerError } from '../src/common/errors';
import { CustomersService } from '../src/customers/customers.service';
import { createTestApp, resetDatabase, TestApp } from './test-app';

describe('Customers (integration)', () => {
  let testApp: TestApp;
  let customers: CustomersService;

  beforeAll(async () => {
    testApp = await createTestApp();
    customers = testApp.app.get(CustomersService);
  });

  afterAll(async () => {
    await testApp.app.close();
  });

  beforeEach(async () => {
    await resetDatabase(testApp.prisma);
  });

  it('creates a customer with normalized fields', async () => {
    const customer = await customers.create({ baseName: '  Mehmet   7asan ' });
    expect(customer.baseName).toBe('Mehmet 7asan');
    expect(customer.normalizedBaseName).toBe('mehmet 7asan');
  });

  it('rejects a duplicate base name without identifier', async () => {
    await customers.create({ baseName: 'Mehmet Ali' });
    await expect(customers.create({ baseName: 'mehmet ali' })).rejects.toBeInstanceOf(
      DuplicateCustomerError,
    );
  });

  it('allows the same base name with a distinguishing identifier', async () => {
    await customers.create({ baseName: 'Mehmet Ali' });
    const second = await customers.create({ baseName: 'Mehmet Ali', identifier: 'Karadere' });
    expect(customers.label(second)).toBe('Mehmet Ali - Karadere');

    await expect(
      customers.create({ baseName: 'Mehmet Ali', identifier: 'karadere' }),
    ).rejects.toBeInstanceOf(DuplicateCustomerError);
  });

  it('finds customers with Turkish-folded search', async () => {
    await customers.create({ baseName: 'Şükrü Çelik' });
    const matches = await customers.search('sukru celik');
    expect(matches).toHaveLength(1);
    expect(matches[0].baseName).toBe('Şükrü Çelik');
  });

  it('searches by identifier too', async () => {
    await customers.create({ baseName: 'Mehmet Ali', identifier: 'Karadere' });
    const matches = await customers.search('karadere');
    expect(matches).toHaveLength(1);
  });
});
