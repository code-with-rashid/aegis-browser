import {
  DEFAULT_DENY_LIST_HOST_SUFFIXES,
  type PolicyMode,
  type PolicyStore,
  type SitePolicy,
} from '@aegis/security';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';

import { EMPTY_SITE_POLICY_DRAFT, normalizeOrigin, toSitePolicy } from './site-policy-draft';

export interface PermissionsPanelProps {
  readonly store: PolicyStore;
}

type RowStatus = { status: 'idle' } | { status: 'saving' } | { status: 'error'; message: string };

const MODE_OPTIONS: readonly { mode: PolicyMode; label: string }[] = [
  { mode: 'ask', label: 'Ask' },
  { mode: 'allow', label: 'Allow' },
  { mode: 'deny', label: 'Deny' },
];

/** Per-site policy management: list/add/edit/remove policies, and view the hard deny-list (#29). */
export function PermissionsPanel({ store }: PermissionsPanelProps): React.JSX.Element {
  const [policies, setPolicies] = useState<readonly SitePolicy[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [rowStatus, setRowStatus] = useState<Record<string, RowStatus>>({});
  const [draft, setDraft] = useState(EMPTY_SITE_POLICY_DRAFT);
  const [addError, setAddError] = useState<string | undefined>(undefined);

  async function refresh(): Promise<void> {
    const result = await store.listPolicies();
    if (result.ok) {
      setPolicies([...result.value].sort((a, b) => a.origin.localeCompare(b.origin)));
    }
  }

  useEffect(() => {
    store
      .listPolicies()
      .then((result) => {
        if (result.ok) {
          setPolicies([...result.value].sort((a, b) => a.origin.localeCompare(b.origin)));
        }
      })
      .catch(() => undefined)
      .finally(() => {
        setLoaded(true);
      });
  }, [store]);

  async function updatePolicy(policy: SitePolicy): Promise<void> {
    setRowStatus((current) => ({ ...current, [policy.origin]: { status: 'saving' } }));
    const result = await store.setPolicy(policy);
    if (result.ok) {
      setRowStatus((current) => ({ ...current, [policy.origin]: { status: 'idle' } }));
      await refresh();
    } else {
      setRowStatus((current) => ({
        ...current,
        [policy.origin]: { status: 'error', message: result.error.message },
      }));
    }
  }

  async function removePolicy(origin: string): Promise<void> {
    setRowStatus((current) => ({ ...current, [origin]: { status: 'saving' } }));
    const result = await store.removePolicy(origin);
    if (result.ok) {
      await refresh();
    } else {
      setRowStatus((current) => ({
        ...current,
        [origin]: { status: 'error', message: result.error.message },
      }));
    }
  }

  async function handleAdd(): Promise<void> {
    const normalized = normalizeOrigin(draft.origin);
    if (normalized === undefined) {
      setAddError('Enter a valid origin, e.g. https://example.com');
      return;
    }
    if (policies.some((policy) => policy.origin === normalized)) {
      setAddError('This origin already has a policy — edit it below instead.');
      return;
    }
    const policy = toSitePolicy(draft);
    if (policy === undefined) {
      setAddError('Enter a valid origin, e.g. https://example.com');
      return;
    }
    setAddError(undefined);
    const result = await store.setPolicy(policy);
    if (result.ok) {
      setDraft(EMPTY_SITE_POLICY_DRAFT);
      await refresh();
    } else {
      setAddError(result.error.message);
    }
  }

  if (!loaded) {
    return <p className="p-4 text-sm text-muted-foreground">Loading…</p>;
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Site policies</h2>
        {policies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No site policies configured yet.</p>
        ) : (
          <ul className="space-y-2">
            {policies.map((policy) => {
              const status = rowStatus[policy.origin] ?? { status: 'idle' };
              return (
                <li
                  key={policy.origin}
                  className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {policy.origin}
                  </span>
                  <label className="text-xs text-muted-foreground">
                    Mode for {policy.origin}
                    <select
                      className="ml-1 rounded border border-border bg-background p-1 text-sm text-foreground"
                      value={policy.mode}
                      onChange={(event) => {
                        void updatePolicy({ ...policy, mode: event.target.value as PolicyMode });
                      }}
                    >
                      {MODE_OPTIONS.map((option) => (
                        <option key={option.mode} value={option.mode}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={policy.allowStateChanging}
                      onChange={(event) => {
                        void updatePolicy({
                          ...policy,
                          allowStateChanging: event.target.checked,
                        });
                      }}
                    />
                    Allow state-changing actions unattended
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={status.status === 'saving'}
                    onClick={() => void removePolicy(policy.origin)}
                  >
                    Remove
                  </Button>
                  {status.status === 'error' ? (
                    <span className="w-full text-xs text-red-600">{status.message}</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2 rounded-md border border-border p-3">
        <h3 className="text-sm font-medium">Add a site policy</h3>
        <div className="flex flex-wrap items-center gap-2">
          <label className="min-w-[14rem] flex-1 text-xs text-muted-foreground">
            Origin
            <input
              className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              placeholder="https://example.com"
              value={draft.origin}
              onChange={(event) => {
                setDraft({ ...draft, origin: event.target.value });
                setAddError(undefined);
              }}
            />
          </label>
          <label className="text-xs text-muted-foreground">
            Mode
            <select
              className="ml-1 rounded border border-border bg-background p-1.5 text-sm text-foreground"
              value={draft.mode}
              onChange={(event) => {
                setDraft({ ...draft, mode: event.target.value as PolicyMode });
              }}
            >
              {MODE_OPTIONS.map((option) => (
                <option key={option.mode} value={option.mode}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={draft.allowStateChanging}
              onChange={(event) => {
                setDraft({ ...draft, allowStateChanging: event.target.checked });
              }}
            />
            Allow state-changing actions unattended
          </label>
          <Button type="button" size="sm" onClick={() => void handleAdd()}>
            Add
          </Button>
        </div>
        {addError !== undefined ? <p className="text-xs text-red-600">{addError}</p> : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-medium">Hard deny-list</h3>
        <p className="text-xs text-muted-foreground">
          These are always denied regardless of a site policy, unless you explicitly set that exact
          origin&apos;s mode to Allow above.
        </p>
        <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-3">
          {DEFAULT_DENY_LIST_HOST_SUFFIXES.map((suffix) => (
            <li key={suffix}>{suffix}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}
