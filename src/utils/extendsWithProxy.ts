import { PrismaClient } from '@prisma/client';

type ExtensionArgs = Parameters<PrismaClient['$extends']>[0];

export function extendsWithProxy<T extends PrismaClient>(instanciaBase: T, extensao: ExtensionArgs): T {
  const instanciaEstendida = instanciaBase.$extends(extensao);

  const proxy = new Proxy(instanciaBase as unknown as object, {
    get(target, prop, receiver) {
      if (prop === 'toString') {
        return () => '[Proxy toString]';
      }
      if (prop === Symbol.toStringTag) {
        return undefined;
      }
      return prop in instanciaEstendida
        ? Reflect.get(instanciaEstendida as any, prop, receiver)
        : Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      return prop in target || prop in (instanciaEstendida as any);
    },
  });

  return proxy as unknown as T;
}
