import { describe, expect, it } from 'vitest';
import { shouldPromptDeveloperReport } from '../errorReporting';

describe('shouldPromptDeveloperReport', () => {
  it('does not prompt for validation messages', () => {
    expect(shouldPromptDeveloperReport({ message: 'Senha fraca' })).toBe(false);
    expect(shouldPromptDeveloperReport({ message: 'cliente_id é obrigatório.' })).toBe(false);
    expect(shouldPromptDeveloperReport({ message: 'HTTP_400: campo obrigatório' })).toBe(false);
  });

  it('prompts for 5xx', () => {
    expect(shouldPromptDeveloperReport({ message: 'HTTP_500: internal_server_error' })).toBe(true);
    expect(shouldPromptDeveloperReport({ message: 'POST ... 500 (Internal Server Error)' })).toBe(true);
  });

  it('prompts for unexpected runtime errors', () => {
    expect(shouldPromptDeveloperReport({ message: 'Unexpected Application Error! Cannot read properties of null' })).toBe(true);
  });
});

