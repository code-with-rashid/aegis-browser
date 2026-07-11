import type { WorkflowParam } from '@aegis/workflows';
import { describe, expect, it } from 'vitest';

import {
  addParam,
  changeParamKindAt,
  removeParamAt,
  updateParamFieldAt,
  updateSecretNameAt,
  updateValueDefaultAt,
} from './workflow-params-editor-actions';

const VALUE_PARAM: WorkflowParam = { kind: 'value', name: 'quantity', defaultValue: '2' };
const SECRET_PARAM: WorkflowParam = {
  kind: 'secret',
  name: 'apiToken',
  secretName: 'oat_milk_token',
};

describe('addParam', () => {
  it('appends a blank value-kind param', () => {
    expect(addParam([], 'value')).toEqual([{ kind: 'value', name: '' }]);
  });

  it('appends a blank secret-kind param', () => {
    expect(addParam([], 'secret')).toEqual([{ kind: 'secret', name: '', secretName: '' }]);
  });

  it('leaves existing params untouched', () => {
    expect(addParam([VALUE_PARAM], 'secret')).toEqual([
      VALUE_PARAM,
      { kind: 'secret', name: '', secretName: '' },
    ]);
  });
});

describe('removeParamAt', () => {
  it('removes only the param at the given index', () => {
    expect(removeParamAt([VALUE_PARAM, SECRET_PARAM], 0)).toEqual([SECRET_PARAM]);
  });

  it('is a no-op for an out-of-range index', () => {
    expect(removeParamAt([VALUE_PARAM], 5)).toEqual([VALUE_PARAM]);
  });
});

describe('changeParamKindAt', () => {
  it('switches a value param to secret, dropping defaultValue and adding a blank secretName', () => {
    expect(changeParamKindAt([VALUE_PARAM], 0, 'secret')).toEqual([
      { kind: 'secret', name: 'quantity', secretName: '' },
    ]);
  });

  it('switches a secret param to value, dropping secretName', () => {
    expect(changeParamKindAt([SECRET_PARAM], 0, 'value')).toEqual([
      { kind: 'value', name: 'apiToken' },
    ]);
  });

  it('carries description through when switching kind', () => {
    const withDescription: WorkflowParam = { ...VALUE_PARAM, description: 'how many' };
    expect(changeParamKindAt([withDescription], 0, 'secret')).toEqual([
      { kind: 'secret', name: 'quantity', description: 'how many', secretName: '' },
    ]);
  });

  it('is a no-op when the kind is unchanged', () => {
    expect(changeParamKindAt([VALUE_PARAM], 0, 'value')).toEqual([VALUE_PARAM]);
  });

  it('only changes the param at the given index', () => {
    const result = changeParamKindAt([VALUE_PARAM, SECRET_PARAM], 0, 'secret');
    expect(result[1]).toEqual(SECRET_PARAM);
  });
});

describe('updateParamFieldAt', () => {
  it('updates the name field', () => {
    expect(updateParamFieldAt([VALUE_PARAM], 0, 'name', 'renamed')).toEqual([
      { ...VALUE_PARAM, name: 'renamed' },
    ]);
  });

  it('updates the description field', () => {
    expect(updateParamFieldAt([VALUE_PARAM], 0, 'description', 'how many')).toEqual([
      { ...VALUE_PARAM, description: 'how many' },
    ]);
  });
});

describe('updateValueDefaultAt', () => {
  it('updates a value param default', () => {
    expect(updateValueDefaultAt([VALUE_PARAM], 0, '5')).toEqual([
      { ...VALUE_PARAM, defaultValue: '5' },
    ]);
  });

  it('leaves a secret param untouched', () => {
    expect(updateValueDefaultAt([SECRET_PARAM], 0, '5')).toEqual([SECRET_PARAM]);
  });
});

describe('updateSecretNameAt', () => {
  it('updates a secret param secretName', () => {
    expect(updateSecretNameAt([SECRET_PARAM], 0, 'new_secret')).toEqual([
      { ...SECRET_PARAM, secretName: 'new_secret' },
    ]);
  });

  it('leaves a value param untouched', () => {
    expect(updateSecretNameAt([VALUE_PARAM], 0, 'new_secret')).toEqual([VALUE_PARAM]);
  });
});
