type IdentifierResolver = (name: string) => number;

type Token =
  | { type: 'number'; value: number }
  | { type: 'identifier'; value: string }
  | { type: 'operator'; value: string }
  | { type: 'leftParen' }
  | { type: 'rightParen' }
  | { type: 'end' };

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '|': 3,
  '^': 4,
  '&': 5,
  '==': 6,
  '!=': 6,
  '<': 7,
  '<=': 7,
  '>': 7,
  '>=': 7,
  '<<': 8,
  '>>': 8,
  '+': 9,
  '-': 9,
  '*': 10,
  '/': 10,
  '%': 10,
};

function tokenize(expression: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;

  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === '(') {
      tokens.push({ type: 'leftParen' });
      index++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'rightParen' });
      index++;
      continue;
    }

    const numberMatch = expression.slice(index).match(/^(?:0[xX][0-9a-fA-F]+|0[bB][01]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/);
    if (numberMatch) {
      const raw = numberMatch[0];
      const value = /^0x/i.test(raw)
        ? parseInt(raw.slice(2), 16)
        : /^0b/i.test(raw)
          ? parseInt(raw.slice(2), 2)
          : Number(raw);
      tokens.push({ type: 'number', value });
      index += raw.length;
      continue;
    }

    if (char === "'") {
      const end = expression.indexOf("'", index + 1);
      if (end < 0) throw new Error('Unterminated character literal');
      const raw = expression.slice(index + 1, end);
      const escaped: Record<string, number> = { '\\n': 10, '\\r': 13, '\\t': 9, '\\0': 0, "\\'": 39, '\\\\': 92 };
      const value = escaped[raw] ?? raw.codePointAt(0) ?? 0;
      tokens.push({ type: 'number', value });
      index = end + 1;
      continue;
    }

    const identifierMatch = expression.slice(index).match(/^[a-zA-Z_]\w*/);
    if (identifierMatch) {
      tokens.push({ type: 'identifier', value: identifierMatch[0] });
      index += identifierMatch[0].length;
      continue;
    }

    const operator = ['||', '&&', '==', '!=', '<=', '>=', '<<', '>>']
      .find((candidate) => expression.startsWith(candidate, index));
    if (operator) {
      tokens.push({ type: 'operator', value: operator });
      index += operator.length;
      continue;
    }

    if ('+-*/%<>!~&|^'.includes(char)) {
      tokens.push({ type: 'operator', value: char });
      index++;
      continue;
    }

    throw new Error(`Unsupported expression token: ${char}`);
  }

  tokens.push({ type: 'end' });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly resolveIdentifier: IdentifierResolver,
  ) {}

  parse(): number {
    const value = this.parseBinary(1);
    if (this.current().type !== 'end') throw new Error('Unexpected expression input');
    return Number.isFinite(value) ? value : 0;
  }

  private parseBinary(minPrecedence: number): number {
    let left = this.parseUnary();

    while (true) {
      const token = this.current();
      if (token.type !== 'operator') break;
      const precedence = PRECEDENCE[token.value] || 0;
      if (precedence < minPrecedence) break;

      this.index++;
      const right = this.parseBinary(precedence + 1);
      left = this.applyBinary(token.value, left, right);
    }

    return left;
  }

  private parseUnary(): number {
    const token = this.current();
    if (token.type === 'operator' && ['!', '~', '+', '-'].includes(token.value)) {
      this.index++;
      const value = this.parseUnary();
      if (token.value === '!') return value === 0 ? 1 : 0;
      if (token.value === '~') return ~value;
      if (token.value === '-') return -value;
      return value;
    }

    if (token.type === 'leftParen') {
      this.index++;
      const value = this.parseBinary(1);
      if (this.current().type !== 'rightParen') throw new Error('Missing closing parenthesis');
      this.index++;
      return value;
    }

    if (token.type === 'number') {
      this.index++;
      return token.value;
    }

    if (token.type === 'identifier') {
      this.index++;
      if (token.value === 'true') return 1;
      if (token.value === 'false') return 0;
      return this.resolveIdentifier(token.value);
    }

    throw new Error('Expected an expression value');
  }

  private applyBinary(operator: string, left: number, right: number): number {
    switch (operator) {
      case '||': return left !== 0 || right !== 0 ? 1 : 0;
      case '&&': return left !== 0 && right !== 0 ? 1 : 0;
      case '|': return left | right;
      case '^': return left ^ right;
      case '&': return left & right;
      case '==': return left === right ? 1 : 0;
      case '!=': return left !== right ? 1 : 0;
      case '<': return left < right ? 1 : 0;
      case '<=': return left <= right ? 1 : 0;
      case '>': return left > right ? 1 : 0;
      case '>=': return left >= right ? 1 : 0;
      case '<<': return left << right;
      case '>>': return left >> right;
      case '+': return left + right;
      case '-': return left - right;
      case '*': return left * right;
      case '/': return right === 0 ? 0 : left / right;
      case '%': return right === 0 ? 0 : left % right;
      default: return 0;
    }
  }

  private current(): Token {
    return this.tokens[this.index];
  }
}

export function evaluateNumericExpression(
  expression: string,
  resolveIdentifier: IdentifierResolver = () => 0,
): number {
  try {
    return new Parser(tokenize(expression), resolveIdentifier).parse();
  } catch {
    return 0;
  }
}
