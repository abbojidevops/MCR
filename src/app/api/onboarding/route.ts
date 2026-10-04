import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { TradeKey } from '@/types';
import { setSessionCookie } from '@/lib/session';
import { hashPassword, validatePasswordStrength } from '@/lib/auth/password';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const {
      email,
      password,
      businessName,
      trade,
      ownerName,
      phone,
      carrierName,
      timezone,
      emergencyPhone,
    } = body || {};

    // 1. Validate required fields
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const pwCheck = validatePasswordStrength(password);
    if (!pwCheck.valid) {
      return NextResponse.json({ error: pwCheck.reason }, { status: 400 });
    }

    if (!businessName || !trade || !phone) {
      return NextResponse.json(
        { error: 'businessName, trade, and phone are required' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 2. Uniqueness check for email
    const existingCred = db.findCredentialByEmail(normalizedEmail);
    if (existingCred) {
      return NextResponse.json(
        { error: 'An account with this email address already exists' },
        { status: 409 }
      );
    }

    // 3. Hash password using scrypt with per-user salt: scrypt$N$r$p$salt$hash
    const passwordHash = await hashPassword(password);

    // 4. Create Account and Business Profile (NEVER store password on accounts table)
    const { account, profile, phoneNumber } = db.createAccount(
      businessName,
      trade as TradeKey,
      phone,
      ownerName || 'Business Owner',
      carrierName || 'Verizon Wireless'
    );

    if (timezone) profile.timezone = timezone;
    if (emergencyPhone) profile.emergency_phone = emergencyPhone;

    // 5. Store credentials in dedicated user_credentials table
    const userId = `usr-${account.id.replace('acc-', '')}`;
    const credential = db.createUserCredential({
      user_id: userId,
      account_id: account.id,
      email: normalizedEmail,
      password_hash: passwordHash,
      algorithm: 'scrypt',
    });

    db.logAudit(account.id, 'SIGNUP_COMPLETED', {
      businessName,
      trade,
      phone,
      email: normalizedEmail,
    });

    const response = NextResponse.json({
      success: true,
      account,
      profile,
      phoneNumber,
      user: {
        id: userId,
        email: normalizedEmail,
      },
    });

    // 6. Set httpOnly authenticated session cookie
    return setSessionCookie(response, {
      accountId: account.id,
      userId: credential.user_id,
      role: 'owner',
      isDemo: false,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Onboarding failed' }, { status: 500 });
  }
}
