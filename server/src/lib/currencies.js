/**
 * Currencies offered by the workspace. Frankfurter publishes all of these
 * except MAD (the ECB reference feed has no Moroccan dirham), so MAD is filled
 * from the complementary exchangerate-api feed while everything else comes
 * from Frankfurter.
 */
export const SUPPORTED_CURRENCIES = ['EUR', 'USD', 'GBP', 'MAD', 'CHF', 'CAD'];

export function isSupportedCurrency(value) {
  return SUPPORTED_CURRENCIES.includes(String(value || '').toUpperCase());
}
