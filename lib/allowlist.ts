// Access allowlist. Being an active row in employeeBase.employee is necessary
// but no longer sufficient — only the emails below may sign in. Enforced at
// every auth chokepoint: /api/auth/google-login (and email-login) at sign-in,
// and resolveActiveEmployee() on every authenticated API call so a token
// minted for a non-listed email can never be used.
export const ALLOWED_EMAILS: ReadonlySet<string> = new Set([
  'rashmi.kapse@badho.in',
  'aditya.mukhopadhyay@badho.in',
  'gautam.kumar@badho.in',
  'manisha.taragi@badho.in',
  'abhijeet.tiwari@badho.in',
  'sneha.sahu@badho.in',
  'ansh.gupta@badho.in',
  'gyanvi.sahu@badho.in',
  'hitesh@badho.in',
  'nikita.arya@badho.in',
  'gyanendra@badho.in',
  'aditya.yadav@badho.in',
  'hansaraj.sarkar@badho.in',
  'sulabh.sharma@badho.in',
  'chandan@badho.in',
  'akhilesh.kumar@badho.in',
  'deepansh.tomar@badho.in',
  'kuldeep.singh@badho.in',
  'rachita.ranjan@badho.in',
  'muskan.pandey@badho.in',
  'sushmita.singh@badho.in',
  'rishi@badho.in',
  'amit.sharma@badho.in',
]);

export function isAllowedEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ALLOWED_EMAILS.has(email.toLowerCase().trim());
}
