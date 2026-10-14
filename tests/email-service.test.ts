(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EmailService,
  type SmtpTransport,
  type SmtpTransportFactory,
} from '@/lib/email/email-service';

const SMTP_ENV_KEYS = ['SMTP_URL', 'EMAIL_FROM', 'NEXT_PUBLIC_APP_URL'] as const;

type SmtpEnvKey = (typeof SMTP_ENV_KEYS)[number];

async function withEmailEnv<T>(
  values: Partial<Record<SmtpEnvKey, string | undefined>>,
  run: () => Promise<T>
): Promise<T> {
  const previous = new Map<SmtpEnvKey, string | undefined>();
  for (const key of SMTP_ENV_KEYS) {
    previous.set(key, process.env[key]);
    const value = values[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  try {
    return await run();
  } finally {
    for (const key of SMTP_ENV_KEYS) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

function fakeTransport(
  sendMail: (options: Record<string, unknown>) => Promise<Record<string, unknown>>,
  onClose: () => void = () => undefined
): SmtpTransportFactory {
  return (() => ({
    sendMail: sendMail as any,
    close: onClose,
  })) as SmtpTransportFactory;
}

const weeklyPayload = {
  to: 'owner@example.test',
  trigger: 'weekly_report' as const,
  data: {
    businessName: 'Apex Plumbing',
    missedCallsCount: 2,
    recoveredConversationsCount: 1,
    responseRatePercent: 50,
    qualifiedJobsCount: 1,
    bookedJobsCount: 0,
    estimatedRecoveredValue: 650,
    actualBookedValue: 0,
  },
};

test('EMAIL-SVC-1: SMTP is not considered configured without both URL and explicit sender', async () => {
  await withEmailEnv({}, async () => {
    assert.equal(EmailService.hasTransport(), false);
    let factoryCalled = false;
    const result = await EmailService.sendEmail(weeklyPayload, (() => {
      factoryCalled = true;
      throw new Error('The fake transport must not be called');
    }) as SmtpTransportFactory);

    assert.equal(factoryCalled, false);
    assert.equal(result.accepted, false);
    assert.equal(result.messageId, null);
    assert.equal(result.transport, 'log_only');
    assert.match(result.notice, /SMTP_URL and EMAIL_FROM/);
  });

  await withEmailEnv({ SMTP_URL: 'smtp://mail.example.test:587' }, async () => {
    assert.equal(EmailService.hasTransport(), false, 'a sender is mandatory');
  });
  await withEmailEnv({ EMAIL_FROM: 'reports@example.test' }, async () => {
    assert.equal(EmailService.hasTransport(), false, 'an SMTP URL is mandatory');
  });
});

test('EMAIL-SVC-2: an injected SMTP transport receives the rendered message and acceptance is not called delivery', async () => {
  await withEmailEnv({
    SMTP_URL: 'smtp://mail.example.test:587',
    EMAIL_FROM: 'MCR Reports <reports@example.test>',
    NEXT_PUBLIC_APP_URL: 'https://mcr.example.test',
  }, async () => {
    const receivedOptions: Record<string, unknown>[] = [];
    let closed = 0;
    const factory = fakeTransport(async (options) => {
      receivedOptions.push(options);
      return { accepted: ['owner@example.test'], messageId: '<provider-message-id>' };
    }, () => { closed += 1; });

    const result = await EmailService.sendEmail(weeklyPayload, factory);

    assert.equal(EmailService.hasTransport(), true);
    assert.equal(result.accepted, true);
    assert.equal(result.transport, 'smtp');
    assert.equal(result.messageId, '<provider-message-id>');
    assert.match(result.notice, /final inbox delivery is not confirmed/i);
    assert.equal(closed, 1, 'the one-shot SMTP connection must be closed');
    assert.equal(receivedOptions.length, 1);
    const sentOptions = receivedOptions[0];
    assert.equal(sentOptions.from, 'MCR Reports <reports@example.test>');
    assert.equal(sentOptions.to, 'owner@example.test');
    assert.match(String(sentOptions.subject), /Apex Plumbing/);
    assert.match(String(sentOptions.html), /Estimated opportunity value is an estimate/);
    assert.match(String(sentOptions.text), /Confirmed booked value: \$0/);
  });
});

test('EMAIL-SVC-3: SMTP rejection returns a safe failure and closes the transport', async () => {
  await withEmailEnv({
    SMTP_URL: 'smtps://mail.example.test:465',
    EMAIL_FROM: 'reports@example.test',
  }, async () => {
    let closed = 0;
    const factory = fakeTransport(async () => {
      throw Object.assign(new Error('private server detail'), { code: 'EAUTH' });
    }, () => { closed += 1; });

    const result = await EmailService.sendEmail(weeklyPayload, factory);
    assert.equal(result.accepted, false);
    assert.equal(result.messageId, null);
    assert.equal(result.transport, 'smtp');
    assert.match(result.notice, /SMTP server could not accept/);
    assert.doesNotMatch(result.notice, /private server detail|password|secret/i);
    assert.equal(closed, 1);
  });
});

test('EMAIL-SVC-4: an SMTP response with no accepted recipients is not reported as success', async () => {
  await withEmailEnv({
    SMTP_URL: 'smtp://mail.example.test:587',
    EMAIL_FROM: 'reports@example.test',
  }, async () => {
    const result = await EmailService.sendEmail(
      weeklyPayload,
      fakeTransport(async () => ({ accepted: [], messageId: '<not-accepted>' }))
    );

    assert.equal(result.accepted, false);
    assert.equal(result.messageId, '<not-accepted>');
    assert.match(result.notice, /did not accept the recipient/);
  });
});

test('EMAIL-SVC-5: malformed SMTP URLs and sender header newlines are rejected before transport use', async () => {
  await withEmailEnv({ SMTP_URL: 'https://mail.example.test', EMAIL_FROM: 'reports@example.test' }, async () => {
    assert.equal(EmailService.hasTransport(), false);
    const result = await EmailService.sendEmail(weeklyPayload, (() => {
      throw new Error('Must not connect for an invalid URL');
    }) as SmtpTransportFactory);
    assert.equal(result.accepted, false);
    assert.equal(result.transport, 'log_only');
    assert.match(result.notice, /SMTP configuration is invalid/);
  });

  await withEmailEnv({ SMTP_URL: 'smtp://mail.example.test', EMAIL_FROM: 'reports@example.test\r\nBcc: victim@example.test' }, async () => {
    assert.equal(EmailService.hasTransport(), false);
  });
});

test('EMAIL-SVC-6: invalid recipient addresses never reach the SMTP transport', async () => {
  await withEmailEnv({ SMTP_URL: 'smtp://mail.example.test:587', EMAIL_FROM: 'reports@example.test' }, async () => {
    let factoryCalled = false;
    const result = await EmailService.sendEmail({ ...weeklyPayload, to: 'not-an-email' }, (() => {
      factoryCalled = true;
      throw new Error('No transport should be created');
    }) as SmtpTransportFactory);

    assert.equal(factoryCalled, false);
    assert.equal(result.accepted, false);
    assert.equal(result.transport, 'disabled');
    assert.match(result.notice, /recipient address is invalid/);
  });
});

test('EMAIL-SVC-7: verification emails stay disabled without a working verification flow', async () => {
  await withEmailEnv({ SMTP_URL: 'smtp://mail.example.test:587', EMAIL_FROM: 'reports@example.test' }, async () => {
    let factoryCalled = false;
    const payload = {
      to: 'owner@example.test',
      trigger: 'verification' as const,
      data: { token: 'a-real-looking-token' },
    };
    const result = await EmailService.sendEmail(payload, (() => {
      factoryCalled = true;
      throw new Error('No message should be sent');
    }) as SmtpTransportFactory);
    const preview = EmailService.renderTemplate('verification', { token: 'a-real-looking-token' });

    assert.equal(factoryCalled, false);
    assert.equal(result.accepted, false);
    assert.equal(result.transport, 'disabled');
    assert.match(result.notice, /working email-verification flow is not implemented/);
    assert.match(preview.text, /does not include a working email-verification flow/);
    assert.doesNotMatch(preview.html, /a-real-looking-token|href="https?:[^\"]*\/verify/);
  });
});

test('EMAIL-SVC-8: template values are escaped and untrusted line breaks cannot alter headers', () => {
  const hostileName = '<img src=x onerror=alert(1)>\r\nBcc: victim@example.test';
  const rendered = EmailService.renderTemplate('weekly_report', {
    businessName: hostileName,
    missedCallsCount: 0,
    recoveredConversationsCount: 0,
    responseRatePercent: 0,
    qualifiedJobsCount: 0,
    bookedJobsCount: 0,
    estimatedRecoveredValue: 0,
    actualBookedValue: 0,
  });

  assert.doesNotMatch(rendered.html, /<img src=x/);
  assert.match(rendered.html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(rendered.subject, /[\r\n]/);
  assert.match(rendered.html, /Confirmed booked value:<\/strong> \$0/);
});

test('EMAIL-SVC-9: templates omit invented phone numbers, payment facts, trial metrics, and carrier codes', () => {
  const welcome = EmailService.renderTemplate('welcome', {});
  const verification = EmailService.renderTemplate('verification', {});
  const submitted = EmailService.renderTemplate('registration_submitted', {});
  const payment = EmailService.renderTemplate('payment_successful', {});
  const trial = EmailService.renderTemplate('trial_ending', {});
  const canceled = EmailService.renderTemplate('subscription_canceled', {});
  const weekly = EmailService.renderTemplate('weekly_report', {});

  assert.doesNotMatch(welcome.html, /\+1 \(217\) 555-0190|Verizon Wireless|\*715550190|account is live/i);
  assert.doesNotMatch(verification.html, /token=demo/);
  assert.doesNotMatch(submitted.html, /BN_pending|1 to 3 business days/i);
  assert.doesNotMatch(payment.html, /MCR Pro|149\.00|In 30 days/i);
  assert.doesNotMatch(trial.html, /14-day|11 days|3 days|Jobs Recovered|\$1,850/i);
  assert.doesNotMatch(canceled.html, /\*73/);
  assert.match(weekly.html, /Missed calls received:<\/strong> Not available/);
  assert.doesNotMatch(weekly.html, /would have called a competitor/i);
});
