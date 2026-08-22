export type ReadinessStatus = 'ready' | 'not_ready';

export type DependencyStatus = 'up' | 'down';

export type ReadinessResponse = {
  status: ReadinessStatus;
  dependencies: {
    database: DependencyStatus;
  };
};
