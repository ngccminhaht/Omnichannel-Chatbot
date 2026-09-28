export function createApiClient(config) {
  return async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { Authorization: `Bearer ${config.apiKey}`, 'x-chat2-user-id': config.userId, ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error?.code || 'API_ERROR');
    return data;
  };
}
