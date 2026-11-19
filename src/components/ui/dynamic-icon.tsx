import {
  Smartphone, Shirt, Sofa, Sparkles, ShoppingBasket, Dumbbell, Baby, Watch, Headphones, Laptop, Camera,
  Gem, Footprints, Armchair, CookingPot, SprayCan, Droplet, Coffee, Apple, Package, type LucideIcon,
} from 'lucide-react';

// خريطة ثابتة (بدل استيراد كل الأيقونات) لتقليل حجم الحزمة
const MAP: Record<string, LucideIcon> = {
  smartphone: Smartphone, shirt: Shirt, sofa: Sofa, sparkles: Sparkles, 'shopping-basket': ShoppingBasket,
  dumbbell: Dumbbell, baby: Baby, watch: Watch, headphones: Headphones, laptop: Laptop, camera: Camera,
  gem: Gem, footprints: Footprints, armchair: Armchair, 'cooking-pot': CookingPot, 'spray-can': SprayCan,
  droplet: Droplet, coffee: Coffee, apple: Apple, package: Package,
};
export const ICON_NAMES = Object.keys(MAP);

export function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const I = MAP[name] ?? Package;
  return <I className={className} />;
}
