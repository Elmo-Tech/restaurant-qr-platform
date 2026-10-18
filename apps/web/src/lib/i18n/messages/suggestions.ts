import { defineMessages } from './define';

/** DEC-042: smart suggestions in the Guest cart ("Complete your meal"). */
export const suggestionsMessages = defineMessages({
  en: {
    'settings.tab.suggestions': 'Suggestions',
    'suggestions.heading': 'Smart suggestions',
    'suggestions.description':
      'When a guest opens the cart, the menu suggests dishes that go with what they ordered ("Complete your meal"). Choose where the suggestions come from.',
    'suggestions.mode.off': 'Off',
    'suggestions.mode.offHint': 'No suggestions in the cart.',
    'suggestions.mode.manual': 'My choices',
    'suggestions.mode.manualHint':
      'Only the dishes you pick for each product (in the product page, under Suggestions).',
    'suggestions.mode.auto': 'Automatic',
    'suggestions.mode.autoHint':
      'Dishes your guests often order together, learned from your own served orders. No setup needed.',
    'suggestions.mode.both': 'Both',
    'suggestions.mode.bothHint': 'Your choices first, then the automatic ones to fill the row.',
    'suggestions.current': 'Current',
    'suggestions.saved': 'Suggestions updated.',
    'suggestions.auto.title': 'Automatic suggestions',
    'suggestions.auto.ready':
      'Ready: {count} served orders in the last {days} days. Suggestions appear for dishes ordered together at least 3 times.',
    'suggestions.auto.notReady':
      'Not ready yet: {count} of {minimum} served orders in the last {days} days. Until then no automatic suggestions are shown (your own choices still are).',
    'suggestions.auto.whatsappNote':
      'Orders sent on WhatsApp are not stored, so they are not counted here.',
    'suggestions.needsFullScope': 'Changing suggestions needs restaurant management with access to all branches.',
    'suggestions.loading': 'Loading suggestions...',
    'suggestions.product.title': 'Suggestions',
    'suggestions.product.description':
      'Dishes suggested in the cart when a guest orders this product. Up to {max}.',
    'suggestions.product.add': 'Add a product',
    'suggestions.product.choose': 'Choose a product...',
    'suggestions.product.empty': 'No suggestions chosen for this product.',
    'suggestions.product.moveUp': 'Move up',
    'suggestions.product.moveDown': 'Move down',
    'suggestions.product.remove': 'Remove',
    'suggestions.product.save': 'Save suggestions',
    'suggestions.product.saved': 'Suggestions saved.',
    'suggestions.product.max': 'You can suggest up to {max} products.',
    'suggestions.product.modeOff':
      'Smart suggestions are off, so guests do not see these yet. Turn them on in Settings > Suggestions.',
    'suggestions.product.modeAuto':
      'Suggestions are set to automatic, so these choices are not used right now. Change it in Settings > Suggestions.',
    'suggestions.product.createFirst': 'Save the product first, then choose its suggestions.',
    'error.SUGGESTION_INVALID':
      'A product can suggest up to 6 other products of this restaurant, each once.',
  },
  ar: {
    'settings.tab.suggestions': 'الاقتراحات',
    'suggestions.heading': 'الاقتراحات الذكية',
    'suggestions.description':
      'عندما يفتح الضيف السلة، يقترح المنيو أطباقًا تناسب ما طلبه ("كمّل وجبتك"). اختر مصدر الاقتراحات.',
    'suggestions.mode.off': 'إيقاف',
    'suggestions.mode.offHint': 'بدون اقتراحات في السلة.',
    'suggestions.mode.manual': 'اختياراتي',
    'suggestions.mode.manualHint': 'فقط الأطباق التي تختارها لكل منتج (في صفحة المنتج، قسم الاقتراحات).',
    'suggestions.mode.auto': 'تلقائي',
    'suggestions.mode.autoHint':
      'أطباق يطلبها ضيوفك معًا كثيرًا، يتعلمها النظام من طلباتك المُسلَّمة. لا يحتاج إعدادًا.',
    'suggestions.mode.both': 'الاثنان',
    'suggestions.mode.bothHint': 'اختياراتك أولًا، ثم التلقائية لإكمال الصف.',
    'suggestions.current': 'الحالي',
    'suggestions.saved': 'تم تحديث الاقتراحات.',
    'suggestions.auto.title': 'الاقتراحات التلقائية',
    'suggestions.auto.ready':
      'جاهزة: {count} طلبًا مُسلَّمًا في آخر {days} يومًا. تظهر الاقتراحات للأطباق التي طُلبت معًا 3 مرات على الأقل.',
    'suggestions.auto.notReady':
      'غير جاهزة بعد: {count} من {minimum} طلبًا مُسلَّمًا في آخر {days} يومًا. حتى ذلك الحين لا تظهر اقتراحات تلقائية (واختياراتك تظهر).',
    'suggestions.auto.whatsappNote': 'الطلبات المرسلة على واتساب لا تُحفظ، لذلك لا تُحسب هنا.',
    'suggestions.needsFullScope': 'تغيير الاقتراحات يحتاج إدارة المطعم مع صلاحية على كل الفروع.',
    'suggestions.loading': 'جارٍ تحميل الاقتراحات...',
    'suggestions.product.title': 'الاقتراحات',
    'suggestions.product.description':
      'أطباق تُقترح في السلة عندما يطلب الضيف هذا المنتج. حتى {max} أطباق.',
    'suggestions.product.add': 'إضافة منتج',
    'suggestions.product.choose': 'اختر منتجًا...',
    'suggestions.product.empty': 'لم تُختر اقتراحات لهذا المنتج.',
    'suggestions.product.moveUp': 'تحريك لأعلى',
    'suggestions.product.moveDown': 'تحريك لأسفل',
    'suggestions.product.remove': 'إزالة',
    'suggestions.product.save': 'حفظ الاقتراحات',
    'suggestions.product.saved': 'تم حفظ الاقتراحات.',
    'suggestions.product.max': 'يمكنك اقتراح حتى {max} أطباق.',
    'suggestions.product.modeOff':
      'الاقتراحات الذكية متوقفة، فلا يراها الضيوف الآن. فعّلها من الإعدادات > الاقتراحات.',
    'suggestions.product.modeAuto':
      'الاقتراحات مضبوطة على التلقائي، فلا تُستخدم اختياراتك هذه الآن. غيّر ذلك من الإعدادات > الاقتراحات.',
    'suggestions.product.createFirst': 'احفظ المنتج أولًا ثم اختر اقتراحاته.',
    'error.SUGGESTION_INVALID': 'يمكن للمنتج اقتراح حتى 6 منتجات أخرى من هذا المطعم، كل منتج مرة واحدة.',
  },
});
