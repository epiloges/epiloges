import { notFound } from "next/navigation";
import { connection } from "next/server";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { ProductForm } from "@/components/admin/ProductForm";
import { ProductLifecycleActions } from "@/components/admin/ProductLifecycleActions";
import { updateProduct } from "@/app/admin/(dashboard)/products/actions";
import { formatDate } from "@/lib/format";
import { productToFormValues } from "@/lib/validation/product";
import { getProductById } from "@/services/products";
import { getAllCollections } from "@/services/collections";
import { getCategoryOptions } from "@/services/categories";
import { getSeoDefaults } from "@/services/seo";
import { requireAdminSessionOrRedirect, requireCapabilityOrRedirect } from "@/lib/admin-session";
import { roleHasCapability } from "@/constants/permissions";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

interface AdminProductDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminProductDetailPage({ params }: AdminProductDetailPageProps) {
  await requireCapabilityOrRedirect("catalog:view");
  const { id } = await params;
  // Binding a Server Action to this record encrypts the bound id with a fresh random IV,
  // which Cache Components flags during prerender ("1 Issue" in dev). The page is
  // per-request by nature — it edits one record — so render it that way.
  await connection();
  const session = await requireAdminSessionOrRedirect();
  const [product, collections, categories, seo] = await Promise.all([
    getProductById(id),
    getAllCollections(),
    getCategoryOptions(),
    getSeoDefaults(),
  ]);
  if (!product) notFound();

  const boundUpdate = updateProduct.bind(null, id);

  return (
    <div>
      <AdminPageHeader
        title={product.name}
        description={
          `SKU ${product.sku} · ${product.category} · ${product.status === "draft" ? "Draft — not on the shop yet" : product.status === "active" ? "Live on the shop" : "Archived"}` +
          (product.archivedAt ? ` since ${formatDate(product.archivedAt)}` : "")
        }
        actions={<ProductLifecycleActions id={id} name={product.name} slug={product.slug} status={product.status} canDelete={roleHasCapability(session.role, "catalog:delete")} />}
      />
      {/*
        Keyed by id for the reason the new-product page gives: without it, navigating from one
        record's edit form to another shows the FIRST record's values, and saving writes them
        onto the second. The status is in the key for the same reason: Publish/Archive in the
        header change it server-side, and a form still holding "draft" would un-publish the
        product on the next ordinary Save.
      */}
      <ProductForm key={`${id}:${product.status}`}
        defaultValues={productToFormValues(product)}
        collections={collections.map((c) => ({ id: c.id, title: c.title }))}
        categories={categories}
        seoDefaults={{ siteUrl: seo.siteUrl, titleTemplate: seo.titleTemplate }}
        onSubmit={boundUpdate}
        submitLabel="Save Changes"
      />
    </div>
  );
}
