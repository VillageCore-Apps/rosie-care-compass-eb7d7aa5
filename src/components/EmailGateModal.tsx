import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { logEmailSignup } from '@/lib/leads';

/**
 * Entry gate: first-time visitors enter their email before using the site.
 * The email is logged with a timestamp for the admin portal (/admin), and a
 * localStorage flag lets returning visitors straight through. Policy pages
 * stay reachable (they're linked from the terms modal), and the admin page
 * is exempt so administrators are never locked out.
 */

const EMAIL_KEY = 'rosie-visitor-email';
const SKIP_PATHS = [
  '/privacy-policy',
  '/terms-of-service',
  '/acceptable-use-policy',
  '/admin',
];

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());

const EmailGateModal = () => {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const alreadyEntered = !!localStorage.getItem(EMAIL_KEY);
    setOpen(!alreadyEntered && !SKIP_PATHS.includes(location.pathname));
  }, [location.pathname]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = email.trim().toLowerCase();
    if (!isValidEmail(clean)) {
      setError('Please enter a valid email address.');
      return;
    }
    setError(null);
    setSaving(true);
    // Resolves once the email is stored (falls back to a local queue if the
    // database is unreachable), so the visitor is never left stuck here.
    await logEmailSignup(clean);
    localStorage.setItem(EMAIL_KEY, clean);
    setSaving(false);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-[340px] lg:max-w-[420px] rounded-lg [&>button]:hidden">
        <DialogHeader>
          <DialogTitle className="text-center text-lg font-semibold">
            Welcome! Let&apos;s stay in touch
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="py-2 space-y-4">
            <p className="text-base text-muted-foreground text-center leading-relaxed">
              Please enter your email address to continue to the site.
            </p>
            <Input
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder="you@example.com"
              aria-label="Your email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="text-base"
              autoFocus
            />
            {error && (
              <p className="text-sm text-destructive text-center" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="flex justify-center pt-2">
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'One moment…' : 'Continue'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default EmailGateModal;
