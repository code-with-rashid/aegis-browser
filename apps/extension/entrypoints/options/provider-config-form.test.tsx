// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ProviderConfigForm } from './provider-config-form';
import { EMPTY_PROVIDER_DRAFT } from './provider-draft';

describe('ProviderConfigForm', () => {
  it('masks the API key by default and reveals it via the Show/Hide toggle', async () => {
    const user = userEvent.setup();
    render(<ProviderConfigForm label="Planner" draft={EMPTY_PROVIDER_DRAFT} onChange={vi.fn()} />);

    const apiKeyInput = screen.getByLabelText('API key');
    expect(apiKeyInput).toHaveAttribute('type', 'password');

    await user.click(screen.getByRole('button', { name: 'Show' }));
    expect(apiKeyInput).toHaveAttribute('type', 'text');

    await user.click(screen.getByRole('button', { name: 'Hide' }));
    expect(apiKeyInput).toHaveAttribute('type', 'password');
  });

  it('calls onChange with the updated model when typing', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ProviderConfigForm label="Planner" draft={EMPTY_PROVIDER_DRAFT} onChange={onChange} />);

    await user.type(screen.getByLabelText('Model'), 'x');

    expect(onChange).toHaveBeenCalledWith({ ...EMPTY_PROVIDER_DRAFT, model: 'x' });
  });

  it('shows a Base URL field (not an API key field) for ollama, with the key optional label absent', () => {
    render(
      <ProviderConfigForm
        label="Planner"
        draft={{ kind: 'ollama', apiKey: '', model: 'llama3', baseUrl: '' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText(/Base URL/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument();
  });

  it('shows both an optional Base URL and an optional API key for openai-compatible', () => {
    render(
      <ProviderConfigForm
        label="Planner"
        draft={{ kind: 'openai-compatible', apiKey: '', model: '', baseUrl: '' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('Base URL')).toBeInTheDocument();
    expect(screen.getByLabelText('API key (optional)')).toBeInTheDocument();
  });
});
