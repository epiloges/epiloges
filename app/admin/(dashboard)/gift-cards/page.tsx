import { redirect } from "next/navigation";

// Gift cards are listed on the Discounts & Gift Cards page. This route stays so old links
// and bookmarks land somewhere useful; /admin/gift-cards/new is still the create form.
export default function AdminGiftCardsPage() {
  redirect("/admin/discounts#gift-cards");
}
