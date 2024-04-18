export interface ICache {
  get(key: string): Promise<any>;

  hGet(key: string, field: string): Promise<any>;

  set(key: string, value: any, ttl?: number): void;

  hSet(key: string, field: string, value: any): Promise<void>;

  has(key: string): Promise<boolean>;

  keys(appendCriteria?: string): Promise<string[]>;

  delete(key: string | string[]): Promise<number>;

  hDelete(key: string, field: string): Promise<any>;

  deleteAll(appendCriteria?: string): Promise<number>;
}
