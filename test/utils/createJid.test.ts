import { createJid } from '../../src/utils/createJid';

describe('createJid', () => {
  it('should format a valid BR number by keeping the 9 when DDD is < 31', () => {
    expect(createJid('5511988887777')).toBe('5511988887777@s.whatsapp.net');
    expect(createJid('5530988887777')).toBe('5530988887777@s.whatsapp.net');
  });

  it('should format a BR number by keeping the 9 when DDD >= 31 but joker digit < 7', () => {
    // joker = 6, DDD = 31 -> keeps the 9
    expect(createJid('5531968887777')).toBe('5531968887777@s.whatsapp.net');
  });

  it('should format a BR number by removing the 9 when DDD >= 31 and joker digit >= 7', () => {
    // joker = 8, DDD = 31 -> removes the 9
    expect(createJid('5531988887777')).toBe('553188887777@s.whatsapp.net');
    // joker = 7, DDD = 32 -> removes the 9
    expect(createJid('5532978887777')).toBe('553278887777@s.whatsapp.net');
  });

  it('should return original BR 12-digit number without modifications if it matches without the 9', () => {
    expect(createJid('553188887777')).toBe('553188887777@s.whatsapp.net');
  });

  it('should format MX numbers by stripping the 3rd digit when length is exactly 13', () => {
    expect(createJid('5215512345678')).toBe('525512345678@s.whatsapp.net');
  });

  it('should format AR numbers by stripping the 3rd digit when length is exactly 13', () => {
    expect(createJid('5491112345678')).toBe('541112345678@s.whatsapp.net');
  });

  it('should not strip digits from MX/AR numbers if length is not exactly 13', () => {
    expect(createJid('525512345678')).toBe('525512345678@s.whatsapp.net');
    expect(createJid('541112345678')).toBe('541112345678@s.whatsapp.net');
    expect(createJid('52155123456789')).toBe('52155123456789@s.whatsapp.net');
  });

  it('should keep already formatted group JIDs intact', () => {
    expect(createJid('1234567890-123456@g.us')).toBe('1234567890-123456@g.us');
  });

  it('should keep already formatted broadcast JIDs intact', () => {
    expect(createJid('status@broadcast')).toBe('status@broadcast');
  });

  it('should keep already formatted lid JIDs intact', () => {
    expect(createJid('12345@lid')).toBe('12345@lid');
  });

  it('should strip spaces, plus signs, parenthesis, and trailing splits correctly', () => {
    expect(createJid('+55 (11) 98888-7777:22@c.us')).toBe('5511988887777@s.whatsapp.net');
  });

  it('should parse long hyphenated strings into group JIDs', () => {
    expect(createJid('1234567890123456789012-34')).toBe('1234567890123456789012-34@g.us');
  });

  it('should parse long non-hyphenated strings into group JIDs', () => {
    expect(createJid('123456789012345678901234')).toBe('123456789012345678901234@g.us');
  });
});
