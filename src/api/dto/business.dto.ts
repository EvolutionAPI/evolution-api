export class NumberDto {
  number: string;
}

export class getCatalogDto {
  number?: string;
  limit?: number;
  cursor?: string;
}

export class getCollectionsDto {
  number?: string;
  limit?: number;
}
