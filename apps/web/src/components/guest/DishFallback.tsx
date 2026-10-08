import { GuestIconDish } from './icons';

/**
 * What a product looks like without a photo: a raised tile with a soft saffron glow
 * and ONE neutral serving-cloche line icon -- identical for every product, so a menu
 * without photos reads as a deliberate style, not as missing data. Never a letter,
 * never a grey camera placeholder.
 */
export function DishFallback({
  className = '',
  iconClassName = 'size-10',
}: {
  className?: string;
  iconClassName?: string;
}) {
  return (
    <div
      aria-hidden="true"
      className={`g-fallback flex items-center justify-center text-g-accent ${className}`}
    >
      <GuestIconDish className={iconClassName} />
    </div>
  );
}
