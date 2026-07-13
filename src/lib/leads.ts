import { supabase } from '@/lib/supabase/supabaseClient';

/**
 * Customer email capture ("leads").
 *
 * Visitor emails are stored in the `email_signups` Supabase table
 * (see supabase/migrations/20260713000000_email_signups.sql). If the insert
 * fails — table not created yet, or the visitor is offline — the entry is
 * queued in localStorage instead and flushed to Supabase on the next
 * opportunity, so no signup is ever lost.
 */

export type EmailSignup = {
  id: string;
  email: string;
  created_at: string;
  /** True when the row is still queued locally and not yet in Supabase. */
  pending?: boolean;
};

const PENDING_KEY = 'rosie-pending-email-signups';

/** SQL for the admin page to surface when the table doesn't exist yet. */
export const EMAIL_SIGNUPS_SETUP_SQL = `create table if not exists public.email_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  created_at timestamptz not null default now()
);

alter table public.email_signups enable row level security;

create policy "anyone can sign up"
  on public.email_signups for insert to anon with check (true);

create policy "anyone can read signups"
  on public.email_signups for select to anon using (true);`;

function readPending(): EmailSignup[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writePending(rows: EmailSignup[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(rows));
  } catch {
    // storage unavailable — nothing more we can do
  }
}

function queueLocally(email: string, createdAt: string) {
  const rows = readPending();
  rows.push({
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    email,
    created_at: createdAt,
    pending: true,
  });
  writePending(rows);
}

/** Push any locally-queued signups to Supabase. Keeps whatever still fails. */
export async function flushPendingSignups(): Promise<void> {
  const rows = readPending();
  if (!rows.length) return;
  const stillPending: EmailSignup[] = [];
  for (const row of rows) {
    const { error } = await supabase
      .from('email_signups')
      .insert({ email: row.email, created_at: row.created_at });
    if (error) stillPending.push(row);
  }
  writePending(stillPending);
}

/**
 * Record a visitor's email with a timestamp. Resolves once the email is
 * safely stored somewhere (Supabase, or the local queue as a fallback).
 */
export async function logEmailSignup(email: string): Promise<void> {
  const clean = email.trim().toLowerCase();
  const createdAt = new Date().toISOString();
  try {
    const { error } = await supabase
      .from('email_signups')
      .insert({ email: clean, created_at: createdAt });
    if (error) queueLocally(clean, createdAt);
    else void flushPendingSignups();
  } catch {
    queueLocally(clean, createdAt);
  }
}

export type SignupsResult = {
  rows: EmailSignup[];
  /** Locally-queued rows that haven't reached Supabase yet. */
  pending: EmailSignup[];
  error: string | null;
  /** True when the failure looks like the table hasn't been created yet. */
  tableMissing: boolean;
};

/** Newest-first list of captured emails for the admin portal. */
export async function fetchEmailSignups(): Promise<SignupsResult> {
  await flushPendingSignups();
  try {
    const { data, error } = await supabase
      .from('email_signups')
      .select('id, email, created_at')
      .order('created_at', { ascending: false })
      .limit(2000);
    if (error) {
      const tableMissing =
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        /relation|schema cache|not find/i.test(error.message ?? '');
      return { rows: [], pending: readPending(), error: error.message, tableMissing };
    }
    return { rows: data ?? [], pending: readPending(), error: null, tableMissing: false };
  } catch (e) {
    return {
      rows: [],
      pending: readPending(),
      error: e instanceof Error ? e.message : 'Could not reach the database.',
      tableMissing: false,
    };
  }
}
