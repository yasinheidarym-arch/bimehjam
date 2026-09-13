import {
  type CanonicalProductInput,
  findCanonicalProductConflict,
} from '../../shared/productCanonicalIdentity';
import { productDetectionAliases } from './productDetectionAliases';

type ProductIdentityLookup = {
  insuranceProduct: {
    findMany(args: {
      select: {
        id: true;
        name: true;
        slug: true;
        subCategoryId: true;
        status: true;
        description: true;
      };
    }): Promise<Array<{
      id: string;
      name: string;
      slug: string;
      subCategoryId: string | null;
      status: string;
      description: string | null;
    }>>;
  };
};

let productCanonicalWriteQueue: Promise<void> = Promise.resolve();

export async function withCanonicalProductWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = productCanonicalWriteQueue;
  let release!: () => void;
  productCanonicalWriteQueue = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

export async function findCanonicalProductConflictInDatabase(
  db: ProductIdentityLookup,
  candidate: CanonicalProductInput,
  excludeProductId?: string | null,
) {
  const products = await db.insuranceProduct.findMany({
    select: {
      id: true,
      name: true,
      slug: true,
      subCategoryId: true,
      status: true,
      description: true,
    },
  });

  return findCanonicalProductConflict(candidate, products.map(product => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    subCategoryId: product.subCategoryId,
    status: product.status,
    aliases: productDetectionAliases(product.description),
  })), excludeProductId);
}
