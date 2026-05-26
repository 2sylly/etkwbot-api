export const A_STAR_HEURISTIC_CONSTANT = 12831.0;

export type RouteTerritoryNode = {
  territoryName: string;
  guildUuid: string | null;
  startX: number | null;
  startZ: number | null;
  endX: number | null;
  endZ: number | null;
  links: string[];
};

export type TerritoryGraph = {
  adjacency: Map<string, string[]>;
  territoryByName: Map<string, RouteTerritoryNode>;
};

export type FindCheapestPathOptions = {
  adjacency: Map<string, string[]>;
  territoryByName: Map<string, RouteTerritoryNode>;
  start: string;
  goal: string;
  ownerGuildUuid: string | null;
  capturedTerritories?: ReadonlySet<string>;
  avoidCapturedTerritories?: boolean;
  heuristicConstant?: number;
};

export function getTerritoryCenter(
  territory: Pick<RouteTerritoryNode, "startX" | "startZ" | "endX" | "endZ"> | null | undefined
): [number, number] | null {
  if (
    !territory ||
    territory.startX === null ||
    territory.startZ === null ||
    territory.endX === null ||
    territory.endZ === null
  ) {
    return null;
  }

  return [
    (territory.startX + territory.endX) / 2,
    (territory.startZ + territory.endZ) / 2
  ];
}

export function buildTerritoryAdjacency(territories: RouteTerritoryNode[]): TerritoryGraph {
  const adjacency = new Map<string, Set<string>>();
  const territoryByName = new Map(
    territories.map((territory) => [territory.territoryName, territory] as const)
  );

  const ensureNode = (territoryName: string) => {
    const existing = adjacency.get(territoryName);

    if (existing) {
      return existing;
    }

    const created = new Set<string>();
    adjacency.set(territoryName, created);
    return created;
  };

  for (const territory of territories) {
    const territoryLinks = ensureNode(territory.territoryName);

    for (const linkedTerritoryName of territory.links) {
      territoryLinks.add(linkedTerritoryName);
      ensureNode(linkedTerritoryName).add(territory.territoryName);
    }
  }

  return {
    adjacency: new Map(
      Array.from(adjacency.entries()).map(([territoryName, links]) => [
        territoryName,
        Array.from(links).sort((left, right) => left.localeCompare(right))
      ])
    ),
    territoryByName
  };
}

function reconstructPath(cameFrom: Map<string, string>, current: string): string[] {
  const path = [current];
  let cursor = current;

  while (cameFrom.has(cursor)) {
    cursor = cameFrom.get(cursor)!;
    path.unshift(cursor);
  }

  return path;
}

export function findFastestPath(
  adjacency: Map<string, string[]>,
  start: string,
  goal: string
): string[] | null {
  if (start === goal) {
    return [start];
  }

  const visited = new Set<string>([start]);
  const queue: Array<{ territoryName: string; path: string[] }> = [
    {
      territoryName: start,
      path: [start]
    }
  ];

  while (queue.length > 0) {
    const current = queue.shift();

    if (!current) {
      continue;
    }

    for (const linkedTerritoryName of adjacency.get(current.territoryName) ?? []) {
      if (visited.has(linkedTerritoryName)) {
        continue;
      }

      const nextPath = [...current.path, linkedTerritoryName];

      if (linkedTerritoryName === goal) {
        return nextPath;
      }

      visited.add(linkedTerritoryName);
      queue.push({
        territoryName: linkedTerritoryName,
        path: nextPath
      });
    }
  }

  return null;
}

function estimateRemainingDistanceCost(
  territoryByName: Map<string, RouteTerritoryNode>,
  current: string,
  goal: string,
  heuristicConstant: number
): number {
  if (heuristicConstant <= 0) {
    return 0;
  }

  const currentCenter = getTerritoryCenter(territoryByName.get(current));
  const goalCenter = getTerritoryCenter(territoryByName.get(goal));

  if (!currentCenter || !goalCenter) {
    return 0;
  }

  const directDistance = Math.hypot(
    currentCenter[0] - goalCenter[0],
    currentCenter[1] - goalCenter[1]
  );

  return directDistance / heuristicConstant;
}

export function calculatePathCost(
  path: string[],
  territoryByName: Map<string, RouteTerritoryNode>,
  ownerGuildUuid: string | null,
  capturedTerritories: ReadonlySet<string> = new Set<string>()
): number {
  return path.slice(1).reduce((total, territoryName) => {
    if (capturedTerritories.has(territoryName)) {
      return total + 1;
    }

    const territory = territoryByName.get(territoryName);
    return total + (territory?.guildUuid === ownerGuildUuid ? 0 : 1);
  }, 0);
}

export function pathUsesCapturedTerritory(
  path: string[] | null,
  capturedTerritories: ReadonlySet<string>
): boolean {
  if (!path || capturedTerritories.size === 0) {
    return false;
  }

  return path.some((territoryName) => capturedTerritories.has(territoryName));
}

export function findCheapestPath(options: FindCheapestPathOptions): string[] | null {
  const {
    adjacency,
    territoryByName,
    start,
    goal,
    ownerGuildUuid,
    capturedTerritories = new Set<string>(),
    avoidCapturedTerritories = false,
    heuristicConstant = A_STAR_HEURISTIC_CONSTANT
  } = options;

  if (start === goal) {
    return [start];
  }

  const openSet = new Set<string>([start]);
  const cameFrom = new Map<string, string>();
  const lossScores = new Map<string, number>([[start, 0]]);
  const hopScores = new Map<string, number>([[start, 0]]);

  while (openSet.size > 0) {
    let current: string | null = null;
    let currentLoss = Number.POSITIVE_INFINITY;
    let currentEstimatedDistance = Number.POSITIVE_INFINITY;

    for (const candidate of openSet) {
      const candidateLoss = lossScores.get(candidate) ?? Number.POSITIVE_INFINITY;
      const candidateDistance =
        (hopScores.get(candidate) ?? Number.POSITIVE_INFINITY) +
        estimateRemainingDistanceCost(
          territoryByName,
          candidate,
          goal,
          heuristicConstant
        );

      if (
        current === null ||
        candidateLoss < currentLoss ||
        (candidateLoss === currentLoss && candidateDistance < currentEstimatedDistance)
      ) {
        current = candidate;
        currentLoss = candidateLoss;
        currentEstimatedDistance = candidateDistance;
      }
    }

    if (current === null) {
      break;
    }

    if (current === goal) {
      return reconstructPath(cameFrom, current);
    }

    openSet.delete(current);

    for (const linkedTerritoryName of adjacency.get(current) ?? []) {
      if (avoidCapturedTerritories && capturedTerritories.has(linkedTerritoryName)) {
        continue;
      }

      const linkedTerritory = territoryByName.get(linkedTerritoryName);

      if (!linkedTerritory) {
        continue;
      }

      const tentativeLoss =
        (lossScores.get(current) ?? Number.POSITIVE_INFINITY) +
        (capturedTerritories.has(linkedTerritoryName) ||
        linkedTerritory.guildUuid !== ownerGuildUuid
          ? 1
          : 0);
      const tentativeHops = (hopScores.get(current) ?? Number.POSITIVE_INFINITY) + 1;
      const knownLoss = lossScores.get(linkedTerritoryName) ?? Number.POSITIVE_INFINITY;
      const knownHops = hopScores.get(linkedTerritoryName) ?? Number.POSITIVE_INFINITY;

      if (
        tentativeLoss < knownLoss ||
        (tentativeLoss === knownLoss && tentativeHops < knownHops)
      ) {
        cameFrom.set(linkedTerritoryName, current);
        lossScores.set(linkedTerritoryName, tentativeLoss);
        hopScores.set(linkedTerritoryName, tentativeHops);
        openSet.add(linkedTerritoryName);
      }
    }
  }

  return null;
}
