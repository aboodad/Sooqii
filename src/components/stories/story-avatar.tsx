/* eslint-disable @next/next/no-img-element */
import { cn } from '@/lib/utils';
import { storeTone } from '@/lib/stories';

/** صورة المتجر داخل حلقة الاستوري: ملوّنة لما لم يُشاهَد، رمادية لما شوهد */
export function StoryAvatar({ store, seen, size = 72, className }: {
  store: { id: string; name: string; logo_url: string | null }; seen?: boolean;
  /** رقم بالبكسل، أو 'fluid' ليأخذ مقاس الحاوية (يُحدَّد المقاس بالـ className) */
  size?: number | 'fluid'; className?: string;
}) {
  const fluid = size === 'fluid';
  return (
    <span className={cn('relative grid shrink-0 place-items-center rounded-full p-[3px]', seen ? 'bg-line' : 'story-ring', className)}
      style={fluid ? undefined : { width: size, height: size }}>
      <span className={cn('grid h-full w-full place-items-center overflow-hidden rounded-full border-[3px] border-white text-white', fluid && 'text-[24px] md:text-[30px]')}
        style={{ background: store.logo_url ? '#fff' : storeTone(store.id), fontSize: fluid ? undefined : (size as number) * 0.34 }}>
        {store.logo_url
          ? <img src={store.logo_url} alt="" className="h-full w-full object-cover" loading="lazy" />
          : <span className="font-bold leading-none">{store.name.trim().slice(0, 1)}</span>}
      </span>
    </span>
  );
}
