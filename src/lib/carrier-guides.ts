import { CarrierForwardingGuide } from '@/types';

export const CARRIER_GUIDES: Record<string, CarrierForwardingGuide> = {
  att: {
    carrier_id: 'att',
    carrier_name: 'AT&T Wireless',
    forward_no_answer_code: '*61*{{FORWARD_NUMBER}}#',
    forward_busy_code: '*67*{{FORWARD_NUMBER}}#',
    cancel_forward_code: '#61# and #67# (or ##004#)',
    supports_conditional_forwarding: true,
    instructions: [
      'Open your phone keypad as if making a phone call.',
      'To forward when you DO NOT ANSWER: Dial *61*{{FORWARD_NUMBER}}# and press Call.',
      'You will hear a confirmation tone or see a carrier success pop-up.',
      'To forward when your line is BUSY or you decline a call: Dial *67*{{FORWARD_NUMBER}}# and press Call.',
      'Alternative combined shortcut: Dial *004*{{FORWARD_NUMBER}}# and tap Call to set No Answer, Busy, and Unreachable all at once.',
    ],
    notes:
      'AT&T supports standard GSM call forwarding codes. If you have "Call Protect" or "ActiveArmor" enabled, ensure it does not intercept forwarded calls as spam.',
  },

  verizon: {
    carrier_id: 'verizon',
    carrier_name: 'Verizon Wireless',
    forward_no_answer_code: '*71{{FORWARD_NUMBER}}',
    forward_busy_code: '*71{{FORWARD_NUMBER}}',
    cancel_forward_code: '*73',
    supports_conditional_forwarding: true,
    instructions: [
      'Open your phone keypad dialer.',
      'Dial *71{{FORWARD_NUMBER}} followed directly without spaces.',
      'Press the Call button.',
      'Wait for 2-3 confirmation beeps or a voice prompt, then hang up.',
      'Conditional call forwarding is now active. Your phone will ring 3-4 times; if unanswered or declined, it forwards immediately to MCR.',
      'To disable at any time: Simply dial *73 and press Call.',
    ],
    notes:
      'Verizon uses *71 for "No Answer / Busy Transfer". Do NOT dial *72, because *72 is unconditional call forwarding (which forwards ALL calls immediately without ringing your phone).',
  },

  tmobile: {
    carrier_id: 'tmobile',
    carrier_name: 'T-Mobile',
    forward_no_answer_code: '**61*1{{FORWARD_NUMBER}}*11*20#',
    forward_busy_code: '**67*1{{FORWARD_NUMBER}}#',
    cancel_forward_code: '##004#',
    supports_conditional_forwarding: true,
    instructions: [
      'Open your phone dialer keypad.',
      'Dial **61*1{{FORWARD_NUMBER}}*11*20# and press Call. (The *20# configures your phone to ring for 20 seconds before forwarding).',
      'Dial **67*1{{FORWARD_NUMBER}}# and press Call to handle calls declined when you are on another job.',
      'Dial **62*1{{FORWARD_NUMBER}}# and press Call to handle calls when your phone has no service or is powered off.',
      'Master shortcut: Dial **004*1{{FORWARD_NUMBER}}# and press Call.',
      'To cancel all conditional forwarding: Dial ##004# and press Call.',
    ],
    notes:
      'T-Mobile requires the leading "1" country code before the 10-digit number. Standard GSM string format.',
  },

  xfinity: {
    carrier_id: 'xfinity',
    carrier_name: 'Comcast / Xfinity Mobile',
    forward_no_answer_code: '*71{{FORWARD_NUMBER}}',
    forward_busy_code: '*71{{FORWARD_NUMBER}}',
    cancel_forward_code: '*73',
    supports_conditional_forwarding: true,
    instructions: [
      'Open your phone dialer app.',
      'Dial *71{{FORWARD_NUMBER}} and press Call.',
      'Listen for the confirmation tone and disconnect.',
      'Xfinity Mobile runs on the Verizon network and supports identical conditional codes.',
      'To disable: Dial *73 and press Call.',
    ],
    notes:
      'Make sure "Do Not Disturb" on your handset does not block caller ID transmission to the carrier network.',
  },

  spectrum: {
    carrier_id: 'spectrum',
    carrier_name: 'Spectrum Mobile',
    forward_no_answer_code: '*71{{FORWARD_NUMBER}}',
    forward_busy_code: '*71{{FORWARD_NUMBER}}',
    cancel_forward_code: '*73',
    supports_conditional_forwarding: true,
    instructions: [
      'Open your phone keypad.',
      'Dial *71{{FORWARD_NUMBER}} and press Call.',
      'Wait for the confirmation tone indicating success.',
      'To deactivate: Dial *73 and press Call.',
    ],
    notes:
      'Spectrum Mobile operates on Verizon towers. Supports conditional forwarding seamlessly.',
  },

  uscellular: {
    carrier_id: 'uscellular',
    carrier_name: 'UScellular',
    forward_no_answer_code: '*92{{FORWARD_NUMBER}}',
    forward_busy_code: '*90{{FORWARD_NUMBER}}',
    cancel_forward_code: '*920 and *900',
    supports_conditional_forwarding: true,
    instructions: [
      'Dial *92{{FORWARD_NUMBER}} and press Call to forward on No Answer.',
      'Dial *90{{FORWARD_NUMBER}} and press Call to forward when Busy.',
      'Wait for the audio confirmation tone.',
      'To disable: Dial *920 (cancels no-answer) and *900 (cancels busy).',
    ],
    notes:
      'UScellular uses standard CDMA *92 and *90 codes for no-answer and busy conditional routing.',
  },

  mint: {
    carrier_id: 'mint',
    carrier_name: 'Mint Mobile',
    forward_no_answer_code: '**004*1{{FORWARD_NUMBER}}#',
    forward_busy_code: '**67*1{{FORWARD_NUMBER}}#',
    cancel_forward_code: '##004#',
    supports_conditional_forwarding: true,
    instructions: [
      'Open your phone keypad dialer.',
      'Dial **004*1{{FORWARD_NUMBER}}# and press Call.',
      'A message "Call forwarding registration was successful" will display.',
      'To cancel forwarding: Dial ##004# and press Call.',
    ],
    notes:
      'Mint Mobile runs on T-Mobile network and uses the 3GPP / GSM standard **004* code.',
  },

  cricket: {
    carrier_id: 'cricket',
    carrier_name: 'Cricket Wireless',
    forward_no_answer_code: '*004*{{FORWARD_NUMBER}}#',
    forward_busy_code: '*67*{{FORWARD_NUMBER}}#',
    cancel_forward_code: '##004#',
    supports_conditional_forwarding: true,
    instructions: [
      'Open your phone keypad dialer.',
      'Dial *004*{{FORWARD_NUMBER}}# and press Call.',
      'To turn off: Dial ##004# and press Call.',
    ],
    notes: 'Cricket Wireless runs on AT&T network.',
  },

  voip_landline: {
    carrier_id: 'voip_landline',
    carrier_name: 'VoIP / Office PBX (RingCentral, Vonage, Ooma, Grasshopper)',
    forward_no_answer_code: 'Web Portal Setting',
    forward_busy_code: 'Web Portal Setting',
    cancel_forward_code: 'Web Portal Setting',
    supports_conditional_forwarding: true,
    instructions: [
      'Log into your VoIP carrier web portal (e.g. RingCentral, Nextiva, Vonage, Grasshopper).',
      'Go to Phone System Settings → Call Handling & Forwarding.',
      'Set "After Business Hours" or "If Unanswered after 4 rings" → Forward to External Number.',
      'Enter your designated MCR number: {{FORWARD_NUMBER}}.',
      'Set Caller ID Preservation to "Original Caller ID" (Important).',
      'Save settings and run a test call from another mobile device.',
    ],
    notes:
      'VoIP providers have web dashboards for conditional rollover. Ensure original caller ID pass-through is toggled ON.',
  },
};

export function getCarrierGuide(carrierId: string, forwardNumber: string): CarrierForwardingGuide | undefined {
  const guide = CARRIER_GUIDES[carrierId];
  if (!guide) return undefined;

  const cleanNum = forwardNumber.replace(/\D/g, '');
  const tenDigit = cleanNum.slice(-10);

  return {
    ...guide,
    forward_no_answer_code: guide.forward_no_answer_code.replace(/{{FORWARD_NUMBER}}/g, tenDigit),
    forward_busy_code: guide.forward_busy_code.replace(/{{FORWARD_NUMBER}}/g, tenDigit),
    instructions: guide.instructions.map((inst) => inst.replace(/{{FORWARD_NUMBER}}/g, tenDigit)),
  };
}
