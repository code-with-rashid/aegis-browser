import type { CdpSession } from '@aegis/perception';
import { err, isErr, ok, type Result } from '@aegis/shared';

import type { PostCondition } from '../schema';
import { WorkflowExecutionError } from './executor-error';

/**
 * Resolves `selector` against the current page and reports whether it matches a visible
 * element. "Matches nothing" is a valid `false` result, not an error — an absent element is
 * exactly what `element_hidden` expects to see, and `element_visible` correctly reports
 * `false` for it. Only a genuine CDP failure (a detached session, a broken document) is a
 * `POST_CONDITION_CHECK_FAILED` error.
 */
async function selectorMatchesVisibleElement(
  session: CdpSession,
  selector: string,
): Promise<Result<boolean, WorkflowExecutionError>> {
  const document = await session.send('DOM.getDocument', {});
  if (isErr(document)) {
    return err(
      new WorkflowExecutionError(
        'POST_CONDITION_CHECK_FAILED',
        'Could not read the page document',
        {
          cause: document.error,
        },
      ),
    );
  }

  const found = await session.send('DOM.querySelector', {
    nodeId: document.value.root.nodeId,
    selector,
  });
  if (isErr(found)) {
    return err(
      new WorkflowExecutionError(
        'POST_CONDITION_CHECK_FAILED',
        `Could not query selector "${selector}"`,
        { cause: found.error },
      ),
    );
  }
  if (found.value.nodeId === 0) {
    return ok(false);
  }

  const resolved = await session.send('DOM.resolveNode', { nodeId: found.value.nodeId });
  if (isErr(resolved) || resolved.value.object.objectId === undefined) {
    return ok(false);
  }

  const visibility = await session.send('Runtime.callFunctionOn', {
    objectId: resolved.value.object.objectId,
    functionDeclaration:
      'function() { const style = getComputedStyle(this); return style.display !== "none" && style.visibility !== "hidden" && this.getClientRects().length > 0; }',
    returnByValue: true,
  });
  if (isErr(visibility)) {
    return err(
      new WorkflowExecutionError(
        'POST_CONDITION_CHECK_FAILED',
        `Could not check visibility of selector "${selector}"`,
        { cause: visibility.error },
      ),
    );
  }

  return ok(visibility.value.result.value === true);
}

async function currentUrl(session: CdpSession): Promise<Result<string, WorkflowExecutionError>> {
  const result = await session.send('Runtime.evaluate', {
    expression: 'window.location.href',
    returnByValue: true,
  });
  if (isErr(result) || result.value.exceptionDetails !== undefined) {
    return err(
      new WorkflowExecutionError(
        'POST_CONDITION_CHECK_FAILED',
        'Could not read the current page URL',
        {
          cause: isErr(result) ? result.error : result.value.exceptionDetails,
        },
      ),
    );
  }
  return ok(String(result.value.result.value));
}

async function currentBodyText(
  session: CdpSession,
): Promise<Result<string, WorkflowExecutionError>> {
  const result = await session.send('Runtime.evaluate', {
    expression: 'document.body.innerText',
    returnByValue: true,
  });
  if (isErr(result) || result.value.exceptionDetails !== undefined) {
    return err(
      new WorkflowExecutionError('POST_CONDITION_CHECK_FAILED', 'Could not read the page text', {
        cause: isErr(result) ? result.error : result.value.exceptionDetails,
      }),
    );
  }
  return ok(String(result.value.result.value));
}

/**
 * Checks whether `condition` holds on the current page right now — the "did this step's
 * effect actually happen" half of #112. The deterministic executor (#111) only proves a
 * tool call didn't error; a click that hits the wrong element, or a form that silently
 * rejected input, still reports `succeeded`. Evaluating `expect` catches that class of
 * false-positive step.
 */
export async function evaluatePostCondition(
  condition: PostCondition,
  session: CdpSession,
): Promise<Result<boolean, WorkflowExecutionError>> {
  switch (condition.type) {
    case 'element_visible':
      return selectorMatchesVisibleElement(session, condition.selector);
    case 'element_hidden': {
      const visible = await selectorMatchesVisibleElement(session, condition.selector);
      if (!visible.ok) {
        return visible;
      }
      return ok(!visible.value);
    }
    case 'url_matches': {
      const url = await currentUrl(session);
      if (!url.ok) {
        return url;
      }
      return ok(new RegExp(condition.pattern).test(url.value));
    }
    case 'text_contains': {
      const text = await currentBodyText(session);
      if (!text.ok) {
        return text;
      }
      return ok(text.value.includes(condition.text));
    }
  }
}
