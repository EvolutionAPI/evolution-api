import { join } from 'path';

export const ROOT_DIR = process.cwd();
export const INSTANCE_DIR = join(ROOT_DIR, 'instances');
export const SRC_DIR = join(ROOT_DIR, 'src');
export const AUTH_DIR = join(ROOT_DIR, 'store', 'auth');
export const STORE_DIR = join(ROOT_DIR, 'store');
