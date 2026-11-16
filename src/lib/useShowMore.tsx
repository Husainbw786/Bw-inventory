import * as React from "react";

// Long lists render the first rows only and add more as the user scrolls near
// the end, so a business with thousands of bills doesn't build thousands of
// rows on every render. Render `more` right after the list.
export function useShowMore<T>(list: T[], step = 50): { shown: T[]; more: React.ReactNode } {
  const [count, setCount] = React.useState(step);
  const sentinel = React.useRef<HTMLDivElement>(null);
  const hasMore = list.length > count;

  React.useEffect(() => {
    const el = sentinel.current;
    if (!hasMore || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setCount((c) => c + step);
      },
      { rootMargin: "600px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, step, count]);

  const more = hasMore ? (
    <div ref={sentinel} className="flex justify-center py-3">
      <button
        type="button"
        onClick={() => setCount((c) => c + step)}
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        Show more ({list.length - count} left)
      </button>
    </div>
  ) : null;

  return { shown: hasMore ? list.slice(0, count) : list, more };
}
