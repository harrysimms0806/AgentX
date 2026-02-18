import { Project } from '@agentx/api-types';
export declare const projects: {
    get(id: string): Project | undefined;
    getAll(): Project[];
    set(id: string, project: Project): void;
    has(id: string): boolean;
    delete(id: string): boolean;
    [Symbol.iterator](): Iterator<[string, Project]>;
    values(): Project[];
    keys(): Iterator<string>;
};
