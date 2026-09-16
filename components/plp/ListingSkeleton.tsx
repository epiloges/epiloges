/**
 * What a listing looks like before it streams in — the same container, the same sidebar
 * column, the same 2/3/4-column grid of 3:4 cards, so the page below it does not move.
 *
 * The listing renders inside a Suspense boundary whose fallback was `null`. On a category
 * with FAQs that put the FAQ section in the first paint, at the top of the viewport, and
 * then pushed it 800px down the moment the grid arrived: a Cumulative Layout Shift of 0.21
 * on every category page, twice the threshold Google fails a page at.
 */
export function ListingSkeleton({ cards = 8, withHeader = false }: { cards?: number; withHeader?: boolean }) {
  return (
    <div className="container-luxe py-10 md:py-14" aria-hidden>
      {withHeader ? (
        <div className="mb-8">
          <div className="h-9 w-56 bg-luxe-gray-light md:h-10" />
        </div>
      ) : null}
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[240px_1fr]">
        <aside className="hidden lg:block" />
        <div>
          <div className="flex h-10 items-center justify-between">
            <div className="h-4 w-24 bg-luxe-gray-light" />
            <div className="h-9 w-36 bg-luxe-gray-light" />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-x-px gap-y-6 lg:grid-cols-3 lg:gap-y-8 xl:grid-cols-4">
            {Array.from({ length: cards }, (_, index) => (
              <div key={index}>
                <div className="aspect-3/4 bg-luxe-gray-light" />
                <div className="mt-3 h-4 w-3/4 bg-luxe-gray-light" />
                <div className="mt-2 h-4 w-1/4 bg-luxe-gray-light" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
