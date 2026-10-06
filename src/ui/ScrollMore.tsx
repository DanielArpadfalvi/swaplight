/** Bouncing chevron at the bottom edge of a scroll area that has more content below. */
export function ScrollMore({ show }: { show: boolean }) {
  return (
    <span class={`scroll-more${show ? ' is-on' : ''}`} aria-hidden="true" data-testid="scroll-more">
      <svg viewBox="0 0 24 24" width="18" height="18">
        <path d="M6 9l6 6 6-6" />
      </svg>
    </span>
  );
}
