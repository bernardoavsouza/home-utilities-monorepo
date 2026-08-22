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
  if (actual !== expected) {
    const attr =
      label.startsWith('model ') || label.startsWith('enum ')
        ? '@@map'
        : '@map';
    violations.push(`${label} missing ${attr}("${expected}")`);
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
