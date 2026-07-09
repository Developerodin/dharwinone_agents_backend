/**
 * Phone number normalization and validation (E.164).
 * Copied from uat.dharwin.backend src/utils/phone.js.
 */

function normalizePhone(phone, countryCode) {
  if (!phone || typeof phone !== 'string') return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits.length) return null;

  // Already prefixed with a known country dial code
  if (digits.startsWith('91') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  if (digits.startsWith('44') && digits.length >= 12) return `+${digits}`;
  if (digits.startsWith('61') && digits.length >= 11) return `+${digits}`;

  if (digits.length === 10) {
    const cc = String(countryCode || '').toUpperCase();
    if (cc === 'US' || cc === 'CA') return `+1${digits}`;
    if (cc === 'GB') return `+44${digits}`;
    if (cc === 'AU') return `+61${digits}`;
    return `+91${digits}`; // default to India
  }

  if (phone.trim().startsWith('+')) return phone.trim();
  return `+${digits}`;
}

function validatePhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  return /^\+[1-9]\d{1,14}$/.test(phone.trim());
}

export { normalizePhone, validatePhone };
