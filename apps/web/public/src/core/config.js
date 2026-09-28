export function readConfig() {
  const config = globalThis.__CHAT2_CONFIG__;
  if (!config || typeof config !== 'object') return { error: 'Frontend auth configuration is missing.' };
  const { workspaceId, userId, apiKey } = config;
  if (![workspaceId, userId, apiKey].every(value => typeof value === 'string' && value.length > 0)) return { error: 'Frontend auth configuration is incomplete.' };
  return { workspaceId, userId, apiKey };
}
