export function parseCorsOrigin(raw: string | undefined): string[] | undefined {
  if (raw === undefined) {
    return undefined;
  }

  const origins = raw
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  if (origins.length === 0) {
    return undefined;
  }

  return origins;
}
