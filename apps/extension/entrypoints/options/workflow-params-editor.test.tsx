// @vitest-environment jsdom
import type { WorkflowParam } from '@aegis/workflows';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { WorkflowParamsEditor } from './workflow-params-editor';

const VALUE_PARAM: WorkflowParam = { kind: 'value', name: 'quantity', defaultValue: '2' };
const SECRET_PARAM: WorkflowParam = {
  kind: 'secret',
  name: 'apiToken',
  secretName: 'oat_milk_token',
};

describe('WorkflowParamsEditor', () => {
  it('shows a message when there are no params', () => {
    render(<WorkflowParamsEditor params={[]} onChange={vi.fn()} />);
    expect(screen.getByText('This workflow has no params.')).toBeInTheDocument();
  });

  it('shows a default-value input for a value-kind param, not a secret-name input', () => {
    render(<WorkflowParamsEditor params={[VALUE_PARAM]} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Param 1 default value')).toHaveValue('2');
    expect(screen.queryByLabelText('Param 1 secret name')).not.toBeInTheDocument();
  });

  it('shows a secret-name input for a secret-kind param, not a default-value input', () => {
    render(<WorkflowParamsEditor params={[SECRET_PARAM]} onChange={vi.fn()} />);
    expect(screen.getByLabelText('Param 1 secret name')).toHaveValue('oat_milk_token');
    expect(screen.queryByLabelText('Param 1 default value')).not.toBeInTheDocument();
  });

  it('calls onChange with an updated name on typing', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowParamsEditor params={[VALUE_PARAM]} onChange={onChange} />);

    await user.type(screen.getByLabelText('Param 1 name'), 'X');

    expect(onChange).toHaveBeenLastCalledWith([{ ...VALUE_PARAM, name: 'quantityX' }]);
  });

  it('calls onChange with the param removed', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowParamsEditor params={[VALUE_PARAM, SECRET_PARAM]} onChange={onChange} />);

    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);

    expect(onChange).toHaveBeenCalledWith([SECRET_PARAM]);
  });

  it('calls onChange with a new blank value param appended', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowParamsEditor params={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add value param' }));

    expect(onChange).toHaveBeenCalledWith([{ kind: 'value', name: '' }]);
  });

  it('calls onChange with a new blank secret param appended', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowParamsEditor params={[]} onChange={onChange} />);

    await user.click(screen.getByRole('button', { name: 'Add secret param' }));

    expect(onChange).toHaveBeenCalledWith([{ kind: 'secret', name: '', secretName: '' }]);
  });

  it('switching kind replaces the type-specific fields', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<WorkflowParamsEditor params={[VALUE_PARAM]} onChange={onChange} />);

    await user.selectOptions(screen.getByLabelText('Param 1 kind'), 'secret');

    expect(onChange).toHaveBeenCalledWith([{ kind: 'secret', name: 'quantity', secretName: '' }]);
  });
});
