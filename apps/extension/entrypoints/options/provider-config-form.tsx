import { useState } from 'react';

import { Button } from '@/components/ui/button';

import { PROVIDER_KIND_LABELS, type ProviderDraft } from './provider-draft';

export interface ProviderConfigFormProps {
  readonly label: string;
  readonly draft: ProviderDraft;
  readonly onChange: (draft: ProviderDraft) => void;
}

/** Provider kind + key/model/base-URL fields for one agent role — the API key is masked by default. */
export function ProviderConfigForm({
  label,
  draft,
  onChange,
}: ProviderConfigFormProps): React.JSX.Element {
  const [showApiKey, setShowApiKey] = useState(false);

  const needsApiKey =
    draft.kind === 'openai' || draft.kind === 'anthropic' || draft.kind === 'google';
  const optionalApiKey = draft.kind === 'openai-compatible';
  const needsBaseUrl = draft.kind === 'openai-compatible';
  const optionalBaseUrl = draft.kind === 'ollama';

  return (
    <fieldset className="space-y-2 rounded-md border border-border p-3">
      <legend className="px-1 text-sm font-medium">{label}</legend>

      <label className="block text-xs text-muted-foreground">
        Provider
        <select
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          value={draft.kind}
          onChange={(event) => {
            onChange({
              ...draft,
              kind: event.target.value as ProviderDraft['kind'],
            });
          }}
        >
          {Object.entries(PROVIDER_KIND_LABELS).map(([kind, kindLabel]) => (
            <option key={kind} value={kind}>
              {kindLabel}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-xs text-muted-foreground">
        Model
        <input
          className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
          value={draft.model}
          placeholder="e.g. gpt-4o-mini"
          onChange={(event) => {
            onChange({ ...draft, model: event.target.value });
          }}
        />
      </label>

      {needsBaseUrl || optionalBaseUrl ? (
        <label className="block text-xs text-muted-foreground">
          Base URL{optionalBaseUrl ? ' (optional, defaults to localhost)' : ''}
          <input
            className="mt-1 block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
            value={draft.baseUrl}
            placeholder={optionalBaseUrl ? 'http://localhost:11434' : 'https://api.example.com/v1'}
            onChange={(event) => {
              onChange({ ...draft, baseUrl: event.target.value });
            }}
          />
        </label>
      ) : null}

      {needsApiKey || optionalApiKey ? (
        <label className="block text-xs text-muted-foreground">
          API key{optionalApiKey ? ' (optional)' : ''}
          <div className="mt-1 flex gap-1">
            <input
              type={showApiKey ? 'text' : 'password'}
              autoComplete="off"
              className="block w-full rounded border border-border bg-background p-1.5 text-sm text-foreground"
              value={draft.apiKey}
              onChange={(event) => {
                onChange({ ...draft, apiKey: event.target.value });
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setShowApiKey((current) => !current);
              }}
            >
              {showApiKey ? 'Hide' : 'Show'}
            </Button>
          </div>
        </label>
      ) : null}
    </fieldset>
  );
}
