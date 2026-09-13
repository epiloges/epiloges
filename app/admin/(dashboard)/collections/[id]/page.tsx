import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { CollectionForm } from "@/components/admin/CollectionForm";
import { updateCollection } from "@/app/admin/(dashboard)/collections/actions";
import { DeleteCollectionButton } from "@/components/admin/DeleteCollectionButton";
import { collectionToFormValues } from "@/lib/validation/collection";
import { getAllCollections } from "@/services/collections";
import { getAllProducts } from "@/services/products";
import { getSeoDefaults } from "@/services/seo";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface AdminCollectionDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminCollectionDetailPage({ params }: AdminCollectionDetailPageProps) {
  const { id } = await params;
  // Binding a Server Action to this record encrypts the bound id with a fresh random IV,
  // which Cache Components flags during prerender ("1 Issue" in dev). The page is
  // per-request by nature — it edits one record — so render it that way.
  await connection();
  const [collections, products, seo] = await Promise.all([
    getAllCollections(),
    getAllProducts({ includeUnpublished: true }),
    getSeoDefaults(),
  ]);
  const collection = collections.find((c) => c.id === id);
  if (!collection) notFound();

  const boundUpdate = updateCollection.bind(null, id);

  return (
    <div>
      <AdminPageHeader
        title={collection.title}
        description={`/${collection.slug}`}
        actions={
          <DeleteCollectionButton id={id} title={collection.title} />
        }
      />
      {/*
        Keyed by id for the reason the new-product page gives: without it, navigating from one
        record's edit form to another shows the FIRST record's values, and saving writes them
        onto the second.
      */}
      <CollectionForm key={id}
        defaultValues={collectionToFormValues(collection)}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        seoDefaults={{ siteUrl: seo.siteUrl, titleTemplate: seo.titleTemplate }}
        onSubmit={boundUpdate}
        submitLabel="Save Changes"
      />
    </div>
  );
}
