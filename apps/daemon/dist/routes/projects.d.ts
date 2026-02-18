import { Project } from '@agentx/api-types';
declare const router: import("express-serve-static-core").Router;
export declare function getProjectById(projectId: string): Project | undefined;
export { router as projectsRouter };
