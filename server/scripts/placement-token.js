// Makes a placement token for a caller (docs/placement.md):
//   npm run placement-token -- sales-hub
// The token goes to the caller (the Hub's PLACEMENT_TOKEN_CLEANBEE). The entry goes in this
// app's PLACEMENT_TOKENS: it's only a fingerprint, so it isn't a secret.
import { newToken } from '../src/placement/tokens.js';

const name = process.argv[2] || 'sales-hub';
if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(name)) {
  console.error('Name the caller in lowercase letters, digits and dashes, e.g. sales-hub.');
  process.exit(2);
}
const { token, entry } = newToken(name);
console.log(`Token (give it to ${name}; shown once):\n  ${token}\n\nEntry for this app's PLACEMENT_TOKENS:\n  ${entry}`);
