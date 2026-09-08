import { toSnakeCase } from '@/shared/infrastructure/prisma/to-snake-case';

function stripComments(schema: string): string {
  return schema.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function blocks(
  schema: string,
  kind: 'model' | 'enum',
): Array<{ name: string; body: string }> {
  const matches = schema.matchAll(
    new RegExp(`${kind}\\s+([A-Za-z_][A-Za-z0-9_]*)\\s*\\{([^}]*)\\}`, 'g'),
  );
  return [...matches].map((match) => ({
    name: match[1],
    body: match[2],
  }));
}

function mappedName(
  source: string,
  attribute: '@map' | '@@map',
): string | undefined {
  return source.match(new RegExp(`${attribute}\\(\\s*"([^"]+)"\\s*\\)`))?.[1];
}

function pluralizeSnake(singular: string): string {
  if (singular.endsWith('y') && !/[aeiou]y$/i.test(singular)) {
    return `${singular.slice(0, -1)}ies`;
  }
  if (
    singular.endsWith('s') ||
    singular.endsWith('x') ||
    singular.endsWith('z') ||
    singular.endsWith('ch') ||
    singular.endsWith('sh')
  ) {
    return `${singular}es`;
  }
  return `${singular}s`;
}

function isAllowedModelMap(identifier: string, actual: string): boolean {
  const expected = toSnakeCase(identifier);
  if (actual === expected) {
    return true;
  }
  // Fin* models use plural table names (fin_accounts) per monorepo-fin-module.
  if (identifier.startsWith('Fin') && actual === pluralizeSnake(expected)) {
    return actual.startsWith('fin_');
  }
  return false;
}

function requireMap(
  violations: string[],
  label: string,
  identifier: string,
  actual: string | undefined,
): void {
  const expected = toSnakeCase(identifier);
  if (expected === identifier) {
    return;
  }
  const isModel = label.startsWith('model ');
  const accepted =
    actual !== undefined &&
    (isModel ? isAllowedModelMap(identifier, actual) : actual === expected);
  if (!accepted) {
    const attr = isModel || label.startsWith('enum ') ? '@@map' : '@map';
    const hint =
      isModel && identifier.startsWith('Fin')
        ? `${expected}" or "${pluralizeSnake(expected)}`
        : expected;
    violations.push(`${label} missing ${attr}("${hint}")`);
  }
}

export function collectPrismaSnakeCaseViolations(schema: string): string[] {
  const cleaned = stripComments(schema);
  const models = blocks(cleaned, 'model');
  const enums = blocks(cleaned, 'enum');
  const modelNames = new Set(models.map((model) => model.name));
  const violations: string[] = [];

  for (const model of models) {
    requireMap(
      violations,
      `model ${model.name}`,
      model.name,
      mappedName(model.body, '@@map'),
    );

    for (const line of model.body.split('\n')) {
      const field = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\s+(\S+)/);
      if (!field || field[1].startsWith('@@')) {
        continue;
      }

      const typeName = field[2].replace(/[[\]?]/g, '');
      if (modelNames.has(typeName) || typeName.startsWith('Unsupported')) {
        continue;
      }

      requireMap(
        violations,
        `${model.name}.${field[1]}`,
        field[1],
        mappedName(line, '@map'),
      );
    }
  }

  for (const enumerated of enums) {
    requireMap(
      violations,
      `enum ${enumerated.name}`,
      enumerated.name,
      mappedName(enumerated.body, '@@map'),
    );

    for (const line of enumerated.body.split('\n')) {
      const value = line.trim().match(/^([A-Za-z_][A-Za-z0-9_]*)\b/);
      if (!value || value[1].startsWith('@@')) {
        continue;
      }

      requireMap(
        violations,
        `${enumerated.name}.${value[1]}`,
        value[1],
        mappedName(line, '@map'),
      );
    }
  }

  return violations;
}
