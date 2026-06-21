import { describe, expect, it } from 'vitest';
import { evaluateNumericExpression } from './ExpressionEvaluator';

const values: Record<string, number> = { i: 4, enabled: 1, sensor: 725 };
const evaluate = (expression: string) => evaluateNumericExpression(expression, (name) => values[name] ?? 0);

describe('evaluateNumericExpression', () => {
  it('respects arithmetic and parenthesis precedence', () => {
    expect(evaluate('2 + 3 * 4')).toBe(14);
    expect(evaluate('(2 + 3) * 4')).toBe(20);
  });

  it('evaluates compound Arduino loop conditions', () => {
    expect(evaluate('i < 10 && enabled')).toBe(1);
    expect(evaluate('i > 10 || sensor >= 700')).toBe(1);
    expect(evaluate('!(i == 4)')).toBe(0);
  });

  it('supports modulo, shifts, hexadecimal, and character literals', () => {
    expect(evaluate('sensor % 100')).toBe(25);
    expect(evaluate('(0x01 << 3) | 0x02')).toBe(10);
    expect(evaluate("'A' == 65")).toBe(1);
  });
});
