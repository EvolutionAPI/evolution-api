// Check if the number is MX or AR
function formatMXOrARNumber(jid: string): string {
  const countryCode = jid.substring(0, 2);

  if (Number(countryCode) === 52 || Number(countryCode) === 54) {
    if (jid.length === 13) {
      const number = countryCode + jid.substring(3);
      return number;
    }

    return jid;
  }
  return jid;
}

// Check if the number is br
function formatBRNumber(jid: string): string {
  if (!jid.startsWith('55')) {
    return jid;
  }

  // 13-digit Brazilian mobile number (55 + DDD + 9 + 8 digits)
  if (jid.length === 13) {
    return jid;
  }

  // 12-digit Brazilian number (55 + DDD + 8 digits)
  if (jid.length === 12) {
    const firstDigit = Number.parseInt(jid[4]);
    // If local number starts with 6, 7, 8, or 9, it's a mobile number missing the 9th digit '9'
    if (firstDigit >= 6) {
      return `${jid.slice(0, 4)}9${jid.slice(4)}`;
    }
  }

  return jid;
}

export function createJid(number: string): string {
  number = number.replace(/:\d+/, '');

  if (
    number.includes('@g.us') ||
    number.includes('@s.whatsapp.net') ||
    number.includes('@lid') ||
    number.includes('@newsletter')
  ) {
    return number;
  }

  if (number.includes('@broadcast')) {
    return number;
  }

  number = number
    ?.replace(/\s/g, '')
    .replace(/\+/g, '')
    .replace(/\(/g, '')
    .replace(/\)/g, '')
    .split(':')[0]
    .split('@')[0];

  if (number.includes('-') && number.length >= 24) {
    number = number.replace(/[^\d-]/g, '');
    return `${number}@g.us`;
  }

  number = number.replace(/\D/g, '');

  if (number.length >= 18) {
    number = number.replace(/[^\d-]/g, '');
    return `${number}@g.us`;
  }

  number = formatMXOrARNumber(number);

  number = formatBRNumber(number);

  return `${number}@s.whatsapp.net`;
}
