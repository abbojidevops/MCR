// Explicit deterministic credentials for security/auth tests. These fixtures are
// test-only and are never imported by application code.
(process.env as any).NODE_ENV = 'test';
process.env.SESSION_SECRET =
  'f4c1a9d83b27e65094af1d2c8b7e035af61c2938d405eb7a19c2f8d6470ba3e5';
process.env.ADMIN_PASSWORD = 'SuperSecureTestAdminPassword2026!';
