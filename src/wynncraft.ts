const requestTimestamps: number[] = [];

function getPrimaryWynncraftToken(): string | null {
  return process.env.WYNNCRAFT_API_TOKEN ?? process.env.WYNNAPI_TOKEN ?? null;
}

function getBackupWynncraftToken(): string | null {
  return process.env.WYNNCRAFT_API_BACKUP_TOKEN ?? process.env.WYNNAPI_BACKUP_TOKEN ?? null;
}

function buildAuthHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
  };
}

function pruneRequestTimestamps(now = Date.now()): void {
  const cutoff = now - 60_000;

  while (requestTimestamps.length > 0 && requestTimestamps[0] < cutoff) {
    requestTimestamps.shift();
  }
}

export function getWynncraftRequestsLastMinute(): number {
  pruneRequestTimestamps();
  return requestTimestamps.length;
}

export async function fetchWithWynncraftAuthFallback(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const primaryToken = getPrimaryWynncraftToken();
  requestTimestamps.push(Date.now());
  pruneRequestTimestamps();
  const primaryResponse = await fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      ...(primaryToken ? buildAuthHeaders(primaryToken) : {}),
    },
  });

  if (primaryResponse.status !== 429) {
    return primaryResponse;
  }

  const backupToken = getBackupWynncraftToken();

  if (!backupToken || backupToken === primaryToken) {
    return primaryResponse;
  }

  requestTimestamps.push(Date.now());
  pruneRequestTimestamps();
  return fetch(input, {
    ...init,
    headers: {
      ...init?.headers,
      ...buildAuthHeaders(backupToken),
    },
  });
}
