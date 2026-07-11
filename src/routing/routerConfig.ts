export function getRouterBasename(baseUrl: string): string | undefined {
  if (baseUrl === '/') {
    return undefined;
  }

  return baseUrl.replace(/\/$/, '');
}
