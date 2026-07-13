import { useCallback, useEffect, useState } from 'react';
import { Lock, RefreshCw, Download, LogOut, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  fetchEmailSignups,
  EmailSignup,
  EMAIL_SIGNUPS_SETUP_SQL,
} from '@/lib/leads';

/**
 * Admin portal (password-gated, client-side only for now).
 * Lists every customer email captured by the entry gate, with the date and
 * time each one was logged, plus refresh and CSV export.
 */

const ADMIN_PASSWORD = 'VillageCore';
const AUTH_KEY = 'rosie-admin-authed';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

const formatTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });

const Admin = () => {
  const [authed, setAuthed] = useState(
    () => sessionStorage.getItem(AUTH_KEY) === 'true'
  );
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [rows, setRows] = useState<EmailSignup[]>([]);
  const [pending, setPending] = useState<EmailSignup[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableMissing, setTableMissing] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchEmailSignups();
    setRows(result.rows);
    setPending(result.pending);
    setLoadError(result.error);
    setTableMissing(result.tableMissing);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authed) void load();
  }, [authed, load]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (password === ADMIN_PASSWORD) {
      sessionStorage.setItem(AUTH_KEY, 'true');
      setAuthed(true);
      setAuthError(null);
    } else {
      setAuthError('Incorrect password.');
    }
    setPassword('');
  };

  const handleLogout = () => {
    sessionStorage.removeItem(AUTH_KEY);
    setAuthed(false);
  };

  const allRows = [...pending, ...rows];

  const exportCsv = () => {
    const lines = [
      'email,date,time,timestamp',
      ...allRows.map(
        (r) =>
          `${r.email},${formatDate(r.created_at)},${formatTime(r.created_at)},${r.created_at}`
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customer-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!authed) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center px-4">
        <Card className="w-full max-w-sm">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>Administrator Access</CardTitle>
            <CardDescription>
              Enter the admin password to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <Input
                type="password"
                placeholder="Password"
                aria-label="Admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {authError && (
                <p className="text-sm text-destructive text-center" role="alert">
                  {authError}
                </p>
              )}
              <Button type="submit" className="w-full">
                Enter
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Admin Portal</h1>
          <p className="text-muted-foreground">
            Customer emails captured at the site entrance.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={allRows.length === 0}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Export CSV
          </Button>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1.5" />
            Log out
          </Button>
        </div>
      </div>

      {tableMissing && (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              One-time database setup needed
            </CardTitle>
            <CardDescription>
              The <code>email_signups</code> table doesn&apos;t exist yet. Open your
              Supabase project → SQL Editor, paste this, and click Run. New
              signups made in the meantime are kept safely on-device and will
              sync automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto whitespace-pre-wrap">
              {EMAIL_SIGNUPS_SETUP_SQL}
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => navigator.clipboard.writeText(EMAIL_SIGNUPS_SETUP_SQL)}
            >
              Copy SQL
            </Button>
          </CardContent>
        </Card>
      )}

      {loadError && !tableMissing && (
        <p className="text-sm text-destructive" role="alert">
          Couldn&apos;t load emails: {loadError}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {allRows.length} email{allRows.length === 1 ? '' : 's'} collected
          </CardTitle>
        </CardHeader>
        <CardContent>
          {allRows.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              No emails yet. When visitors enter their email at the site
              entrance, they&apos;ll appear here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">Email</th>
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {allRows.map((row) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 font-medium break-all">
                        {row.email}
                        {row.pending && (
                          <span className="ml-2 text-xs text-amber-600">
                            (on this device, waiting to sync)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {formatDate(row.created_at)}
                      </td>
                      <td className="py-2.5 pr-4 whitespace-nowrap">
                        {formatTime(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Admin;
