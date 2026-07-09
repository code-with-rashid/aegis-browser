/** Security core: trust-tagging/sanitizer, per-site policy engine, confirmation gate, alignment critic, secret vault. */

export { stripInvisibleChars } from './sanitize/strip-invisible-chars';
export { neutralizeInstructions } from './sanitize/neutralize-instructions';
export { sanitizePageContent } from './sanitize/sanitize-page-content';
export { wrapUntrustedContent } from './sanitize/wrap-untrusted-content';
export { TRUST_BOUNDARY_SYSTEM_CONTRACT } from './sanitize/system-contract';

export type { PolicyMode, SitePolicy, SitePolicyMap } from './policy/site-policy';
export {
  PolicyModeSchema,
  SitePolicySchema,
  SitePolicyMapSchema,
  isPolicyExpired,
} from './policy/site-policy';
export { DEFAULT_DENY_LIST_HOST_SUFFIXES, isDenyListedOrigin } from './policy/deny-list';
export type { PolicyDecision, EvaluatePolicyInput } from './policy/evaluate-policy';
export { evaluatePolicy, decideForRisk, resolveEffectiveMode } from './policy/evaluate-policy';
export type { PolicyStore } from './policy/policy-store';
export { createPolicyStore } from './policy/policy-store';
export type { PolicyEngine } from './policy/policy-engine';
export { createPolicyEngine } from './policy/policy-engine';

export type { VaultErrorCode } from './vault/vault-errors';
export { VaultError } from './vault/vault-errors';
export type { EncryptedBlob } from './vault/crypto-primitives';
export { generateSalt, deriveVaultKey, encryptText, decryptText } from './vault/crypto-primitives';
export type { SecretVault } from './vault/secret-vault';
export { createSecretVault } from './vault/secret-vault';
export { toSecretPlaceholder, findSecretPlaceholderNames } from './vault/secret-placeholder';
export { resolveActionSecrets } from './vault/resolve-action-secrets';
