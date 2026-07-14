import { describe, expect, it, vi } from 'vitest';
import { generateLoyaltyCardNumber } from './loyalty-card.js';

// docs/CUSTOMER_LOYALTY.md §5/§8/§13 step 1.

describe('generateLoyaltyCardNumber', () => {
  it('returns an "LC" + 6-digit candidate when there is no collision', async () => {
    const client = { customer: { findUnique: vi.fn().mockResolvedValue(null) } };
    const cardNumber = await generateLoyaltyCardNumber(client);
    expect(cardNumber).toMatch(/^LC\d{6}$/);
    expect(client.customer.findUnique).toHaveBeenCalledTimes(1);
  });

  it('retries on a @unique collision and returns the next free candidate', async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ id: 'taken-1' })
      .mockResolvedValueOnce({ id: 'taken-2' })
      .mockResolvedValueOnce(null);
    const client = { customer: { findUnique } };
    const cardNumber = await generateLoyaltyCardNumber(client);
    expect(cardNumber).toMatch(/^LC\d{6}$/);
    expect(findUnique).toHaveBeenCalledTimes(3);
  });

  it('throws after 5 straight collisions rather than looping forever', async () => {
    const client = { customer: { findUnique: vi.fn().mockResolvedValue({ id: 'always-taken' }) } };
    await expect(generateLoyaltyCardNumber(client)).rejects.toThrow(/unique loyaltyCardNumber/);
    expect(client.customer.findUnique).toHaveBeenCalledTimes(5);
  });
});
