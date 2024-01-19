export interface ICache {
  get(key: string): Promise<any>;

  set(key: string, value: any, ttl?: number): void;

  has(key: string): Promise<boolean>;

  keys(appendCriteria?: string): Promise<string[]>;

  delete(key: string | string[]): Promise<number>;

  deleteAll(appendCriteria?: string): Promise<number>;
}
