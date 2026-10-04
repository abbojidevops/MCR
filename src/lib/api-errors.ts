import { NextResponse } from 'next/server';

/**
 * Standard byte-identical 404 response for any missing or cross-tenant resource.
 * Returning identical responses prevents timing and existence oracles.
 */
export function notFoundResponse(): NextResponse {
  return NextResponse.json(
    { error: 'Not found' },
    {
      status: 404,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Standard 403 Forbidden response
 */
export function forbiddenResponse(message = 'Forbidden'): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}

/**
 * Standard 401 Unauthorized response
 */
export function unauthorizedResponse(message = 'Unauthorized'): NextResponse {
  return NextResponse.json(
    { error: message },
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
}
