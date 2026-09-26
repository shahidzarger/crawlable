'use client';

import { useState } from 'react';

/**
 * Contact form.
 *
 * Four states, one at a time: idle, submitting, sent, failed. The form is
 * replaced outright on success rather than cleared and left sitting there —
 * a cleared form is ambiguous, and the most common support ticket a contact
 * page generates is "did that go through?".
 *
 * Validation mirrors the API route's schema so the common mistakes are caught
 * before a request is made, but the server is the authority: the browser rules
 * exist to save a round trip, not to be trusted.
 */

const MAX_MESSAGE = 5000;

type State =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'sent' }
  | { phase: 'error'; message: string };

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<State>({ phase: 'idle' });

  const submitting = state.phase === 'submitting';
  const complete =
    name.trim().length > 0 && email.trim().length > 0 && message.trim().length > 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !complete) return;

    setState({ phase: 'submitting' });

    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          message: message.trim(),
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { success: true }
        | { error: string; code?: string }
        | null;

      if (!response.ok || !payload || 'error' in payload) {
        setState({
          phase: 'error',
          message:
            payload && 'error' in payload
              ? payload.error
              : 'Something went wrong sending your message.',
        });
        return;
      }

      setState({ phase: 'sent' });
      setName('');
      setEmail('');
      setMessage('');
    } catch {
      setState({
        phase: 'error',
        message: 'Could not reach us. Check your connection and try again.',
      });
    }
  }

  if (state.phase === 'sent') {
    return (
      <div className="surface-card p-6" role="status">
        <h2 className="text-lg font-semibold tracking-tight">
          <span aria-hidden style={{ color: 'var(--data-good)' }}>
            ✓
          </span>{' '}
          Message received
        </h2>
        <p className="mt-2 text-sm leading-relaxed ink-secondary">
          It has landed in our inbox and a person will read it. Replies usually go out
          within one business day, to the address you gave us.
        </p>
        <button
          type="button"
          onClick={() => setState({ phase: 'idle' })}
          className="btn-ghost mt-5 px-4 py-2 text-sm"
        >
          Send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} aria-busy={submitting} className="space-y-5">
      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium">
          Name
        </label>
        <input
          id="contact-name"
          name="name"
          type="text"
          autoComplete="name"
          required
          maxLength={100}
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={submitting}
          placeholder="Jordan Reyes"
          className="field mt-2 w-full px-4 py-3 text-base outline-none disabled:opacity-60"
        />
      </div>

      <div>
        <label htmlFor="contact-email" className="block text-sm font-medium">
          Work email
        </label>
        <input
          id="contact-email"
          name="email"
          type="email"
          autoComplete="email"
          spellCheck={false}
          required
          maxLength={254}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          disabled={submitting}
          placeholder="you@company.com"
          className="field mt-2 w-full px-4 py-3 text-base outline-none disabled:opacity-60"
        />
        <p className="mt-2 text-xs ink-muted">
          This is where the reply goes, so use an address you actually read.
        </p>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-4">
          <label htmlFor="contact-message" className="block text-sm font-medium">
            Message
          </label>
          <span className="font-mono text-xs tabular-nums ink-muted">
            {message.length}/{MAX_MESSAGE}
          </span>
        </div>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={7}
          maxLength={MAX_MESSAGE}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          disabled={submitting}
          placeholder="If this is about an audit, include the domain you scanned and your license key's last four characters — it saves a round trip."
          className="field mt-2 w-full resize-y px-4 py-3 text-base leading-relaxed outline-none disabled:opacity-60"
        />
      </div>

      {state.phase === 'error' ? (
        <div
          role="alert"
          className="rounded-xl border px-4 py-3 text-sm"
          style={{ borderColor: 'var(--data-bad)' }}
        >
          <p className="font-medium">
            <span aria-hidden style={{ color: 'var(--data-bad)' }}>
              ✕
            </span>{' '}
            Not sent
          </p>
          <p className="mt-1 ink-secondary">{state.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-4">
        <button
          type="submit"
          disabled={submitting || !complete}
          className="btn-primary px-6 py-3 text-base"
        >
          {submitting ? 'Sending…' : 'Send message'}
        </button>
        <p className="text-xs ink-muted">
          We use your message and address to reply, nothing else.
        </p>
      </div>
    </form>
  );
}
