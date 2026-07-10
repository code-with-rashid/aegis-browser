// @vitest-environment jsdom
import type { TraceStep } from '@aegis/agent';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { TraceList } from './trace-list';

function traceStepFixture(overrides: Partial<TraceStep> = {}): TraceStep {
  return {
    stepNumber: 1,
    subGoal: 'Add to cart',
    plannerReasoning: undefined,
    navigatorReasoning: undefined,
    actions: [
      {
        toolId: 'browser.click',
        source: 'browser',
        description: 'Click "Add to cart"',
        argsSummary: '{"type":"click","ref":"ax:1"}',
        succeeded: true,
        errorMessage: undefined,
        estimatedDomStepsSaved: undefined,
      },
    ],
    policyDecision: 'allow',
    verifyOutcome: 'achieved',
    verifierReasoning: undefined,
    perception: undefined,
    ...overrides,
  };
}

describe('TraceList', () => {
  it('renders nothing when there are no steps', () => {
    const { container } = render(<TraceList steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a plain browser action with no source badge', () => {
    render(<TraceList steps={[traceStepFixture()]} />);

    expect(screen.getByText(/Click "Add to cart"/)).toBeInTheDocument();
    expect(screen.queryByText('browser')).not.toBeInTheDocument();
  });

  it('distinguishes an MCP tool call with a visible source badge, separate from a browser action (#90)', () => {
    render(
      <TraceList
        steps={[
          traceStepFixture({
            actions: [
              {
                toolId: 'browser.click',
                source: 'browser',
                description: 'Click "Add to cart"',
                argsSummary: '{"type":"click","ref":"ax:1"}',
                succeeded: true,
                errorMessage: undefined,
                estimatedDomStepsSaved: undefined,
              },
              {
                toolId: 'mcp.weather.get_forecast',
                source: 'mcp',
                description: 'Call tool "mcp.weather.get_forecast" (Sends the forecast request)',
                argsSummary: '{"city":"London"}',
                succeeded: true,
                errorMessage: undefined,
                estimatedDomStepsSaved: 3,
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText('mcp')).toBeInTheDocument();
    expect(
      screen.getByText(/Call tool "mcp.weather.get_forecast" \(Sends the forecast request\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/DOM steps saved/)).toBeInTheDocument();
  });

  it('reveals the tool id and args summary only after "Show args" is clicked', async () => {
    const user = userEvent.setup();
    render(<TraceList steps={[traceStepFixture()]} />);

    expect(screen.queryByText('browser.click')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Show args' }));

    expect(screen.getByText('browser.click')).toBeInTheDocument();
    expect(screen.getByText(/"type":"click"/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Hide args' }));
    expect(screen.queryByText('browser.click')).not.toBeInTheDocument();
  });

  it('marks a failed action distinctly, with its error message', () => {
    render(
      <TraceList
        steps={[
          traceStepFixture({
            actions: [
              {
                toolId: 'browser.click',
                source: 'browser',
                description: 'Click "Add to cart"',
                argsSummary: '{"type":"click","ref":"ax:1"}',
                succeeded: false,
                errorMessage: 'no longer attached',
                estimatedDomStepsSaved: undefined,
              },
            ],
          }),
        ]}
      />,
    );

    expect(screen.getByText(/FAILED/)).toBeInTheDocument();
    expect(screen.getByText(/no longer attached/)).toBeInTheDocument();
  });
});
