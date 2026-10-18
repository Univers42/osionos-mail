import { describe, expect, it } from 'vitest';
import { MOCK_MESSAGES } from './mockMail';

// The preview bundle is public: sample recipients must be reserved-domain
// placeholders, never a real mailbox (the admin's address once shipped here).
const RESERVED_DOMAIN = /@example\.(com|org|net)$/;

describe('MOCK_MESSAGES', () => {
  const recipients = MOCK_MESSAGES.flatMap((m) => [...m.to, ...(m.cc ?? []), ...(m.bcc ?? [])]);

  it('has recipients to check', () => {
    expect(recipients.length).toBeGreaterThan(0);
  });

  it.each(recipients)('addresses %s at a reserved example domain', (address) => {
    expect(address).toMatch(RESERVED_DOMAIN);
  });

  it('names no real person in the message text', () => {
    expect(JSON.stringify(MOCK_MESSAGES)).not.toMatch(/dev\.pro\.photo|dlesieur|lesdylan/i);
  });
});
