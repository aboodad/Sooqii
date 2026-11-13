/**
 * رسومات ثلاثية الأبعاد للأقسام (Microsoft Fluent Emoji 3D — رخصة MIT)
 * المفتاح: slug القسم. الأقسام الجديدة بدون رسمة تعرض أيقونتها العادية.
 */
export const CATEGORY_ART: Record<string, { img: string; tint: string }> = {
  electronics: { img: 'mobile-phone', tint: '#EEEAFB' },
  phones: { img: 'mobile-phone', tint: '#EEEAFB' },
  audio: { img: 'headphone', tint: '#E3F4F4' },
  computers: { img: 'laptop', tint: '#E9EEF2' },
  cameras: { img: 'camera', tint: '#E9EEF2' },
  fashion: { img: 'dress', tint: '#FCE9F1' },
  men: { img: 't-shirt', tint: '#EAF0FB' },
  women: { img: 'handbag', tint: '#FBEAEA' },
  shoes: { img: 'running-shoe', tint: '#FFF0E3' },
  home: { img: 'couch-and-lamp', tint: '#F3ECE6' },
  furniture: { img: 'couch-and-lamp', tint: '#F3ECE6' },
  kitchen: { img: 'cooking', tint: '#ECF3EA' },
  beauty: { img: 'lipstick', tint: '#FBEAEA' },
  perfumes: { img: 'lotion-bottle', tint: '#F3EEFB' },
  skincare: { img: 'lotion-bottle', tint: '#EAF6F1' },
  grocery: { img: 'basket', tint: '#FFF5DA' },
  'coffee-honey': { img: 'honey-pot', tint: '#FFF5DA' },
  fresh: { img: 'red-apple', tint: '#FDECEC' },
  sports: { img: 'soccer-ball', tint: '#E3F4F4' },
  kids: { img: 'teddy-bear', tint: '#FFF0E3' },
  accessories: { img: 'watch', tint: '#EAF0FB' },
};

export const art = (name: string) => `/3d/${name}.png`;
