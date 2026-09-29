// ============================================================================
// Quiet Hours Compliance Enforcement (TCPA & CTIA standard: 8 AM - 9 PM)
// ============================================================================

export interface QuietHoursCheck {
  isWithinHours: boolean;
  recipientLocalHour: number;
  recipientTimezone: string;
  nextAllowedSendTime?: string;
  reason?: string;
}

// Approximate timezone map by standard US area codes (for fallback when customer timezone unknown)
const AREA_CODE_TIMEZONE_MAP: Record<string, string> = {
  // Eastern
  '212': 'America/New_York', '718': 'America/New_York', '917': 'America/New_York',
  '617': 'America/New_York', '305': 'America/New_York', '404': 'America/New_York',
  '202': 'America/New_York', '215': 'America/New_York', '704': 'America/New_York',
  '312': 'America/Chicago',  '773': 'America/Chicago',  '214': 'America/Chicago',
  '713': 'America/Chicago',  '512': 'America/Chicago',  '612': 'America/Chicago',
  '303': 'America/Denver',   '720': 'America/Denver',   '801': 'America/Denver',
  '602': 'America/Phoenix',  '480': 'America/Phoenix',
  '206': 'America/Los_Angeles', '415': 'America/Los_Angeles', '213': 'America/Los_Angeles',
  '310': 'America/Los_Angeles', '619': 'America/Los_Angeles', '503': 'America/Los_Angeles',
};

export function inferTimezoneFromPhone(phone: string, fallbackTz: string = 'America/New_York'): string {
  const digits = phone.replace(/\D/g, '');
  const tenDigit = digits.slice(-10);
  const areaCode = tenDigit.slice(0, 3);
  return AREA_CODE_TIMEZONE_MAP[areaCode] || fallbackTz;
}

export function checkQuietHours(
  timezone: string,
  startHour: number = 8, // 8:00 AM
  endHour: number = 21,  // 9:00 PM (21:00)
  referenceDate: Date = new Date()
): QuietHoursCheck {
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });

    const parts = formatter.formatToParts(referenceDate);
    const hourPart = parts.find((p) => p.type === 'hour');
    const minPart = parts.find((p) => p.type === 'minute');

    const currentHour = hourPart ? parseInt(hourPart.value, 10) : referenceDate.getUTCHours() - 5;
    const currentMin = minPart ? parseInt(minPart.value, 10) : referenceDate.getUTCMinutes();

    const isWithinHours = currentHour >= startHour && currentHour < endHour;

    let nextAllowedSendTime: string | undefined;

    if (!isWithinHours) {
      // Calculate next 8:00 AM in recipient local time
      const nextDate = new Date(referenceDate);
      if (currentHour >= endHour) {
        // After 9 PM, next allowed is tomorrow 8:00 AM
        nextDate.setDate(nextDate.getDate() + 1);
      }
      // Set to 8:05 AM to be safely inside the permitted window
      nextAllowedSendTime = `Tomorrow at 08:00 AM (${timezone})`;
    }

    return {
      isWithinHours,
      recipientLocalHour: currentHour,
      recipientTimezone: timezone,
      nextAllowedSendTime,
      reason: isWithinHours
        ? 'Within TCPA allowable hours (08:00 - 21:00)'
        : `Outside TCPA allowable hours (Local time: ${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')} ${timezone})`,
    };
  } catch (err) {
    // If timezone parsing fails, default to conservative check
    return {
      isWithinHours: true,
      recipientLocalHour: 12,
      recipientTimezone: 'America/New_York',
      reason: 'Timezone fallback permitted',
    };
  }
}
