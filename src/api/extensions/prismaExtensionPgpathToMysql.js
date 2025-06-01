import { Prisma } from '@prisma/client'
import { Logger } from '@config/logger.config';

const logger = new Logger('PGPATH2MYSQL');

function convertPgPathToMysql (path) {
  if (!Array.isArray(path)) return path
  let result = '$'
  for (const item of path) {
    if (/^\d+$/.test(item)) {
      result += `[${item}]`
    } else {
      result += `.${item}`
    }
  }
  return result
}

function processWhere (obj) {
  if (obj && typeof obj === 'object') {
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (key === 'path') {
          obj[key] = convertPgPathToMysql(obj[key]);
        } else {
          processWhere(obj[key]);
        }
      }
    }
  }
}

// https://www.prisma.io/docs/orm/prisma-client/client-extensions/query#modify-all-operations-in-all-models-of-your-schema
// https://www.prisma.io/docs/orm/prisma-client/client-extensions/query#modify-a-specific-operation-in-a-specific-model

const overriddenOperation = async ({ model, operation, args, query }) => {
  if (args?.where) {
    processWhere(args.where)
  }
  const result = await query(args)
  logger.debug({ model, operation, args: JSON.stringify(args), result })
  return result
}

export default Prisma.defineExtension({
  name: 'prisma-extension-pgpath-to-mysql',
  query: {
    $allModels: {
      findFirst: overriddenOperation,
      findMany: overriddenOperation,
      updateMany: overriddenOperation,
      count: overriddenOperation,
      deleteMany: overriddenOperation,

      delete: overriddenOperation,
      findUnique: overriddenOperation,
      update: overriddenOperation,
      upsert: overriddenOperation,
    }
  }
})
