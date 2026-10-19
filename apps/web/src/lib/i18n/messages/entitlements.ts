import { defineMessages } from './define';

/** DEC-043: what the platform has not included in a Restaurant's package. */
export const entitlementsMessages = defineMessages({
  en: {
    'features.whatsapp.locked': 'WhatsApp ordering is not included in your package.',
    'features.templates.locked': 'Only the Classic design is included in your package.',
    'features.suggestions.locked': 'Smart suggestions are not included in your package.',
    'features.dashboardOrdering.locked':
      'Receiving pickup and delivery orders in the dashboard is not included in your package. Guests can still order through WhatsApp when it is turned on.',
    'features.tableOrdering.locked':
      'Table ordering is not included in your package, so the table menu is view-only.',
    'features.notIncluded': 'Not included',
    'features.page.orders': 'Receiving orders in the dashboard is not included in your package.',
    'features.page.tables': 'Table ordering is not included in your package. Your menu QR code is in Settings > Restaurant QR.',
    'error.FEATURE_NOT_AVAILABLE': 'This feature is not included in your package.',
  },
  ar: {
    'features.whatsapp.locked': 'الطلب عبر واتساب غير مشمول في باقتك.',
    'features.templates.locked': 'التصميم الكلاسيك فقط مشمول في باقتك.',
    'features.suggestions.locked': 'الاقتراحات الذكية غير مشمولة في باقتك.',
    'features.dashboardOrdering.locked':
      'استقبال طلبات الاستلام والتوصيل في لوحة التحكم غير مشمول في باقتك. ما زال بإمكان الضيوف الطلب عبر واتساب عند تفعيله.',
    'features.tableOrdering.locked': 'الطلب من الطاولات غير مشمول في باقتك، لذلك منيو الطاولة للعرض فقط.',
    'features.notIncluded': 'غير مشمول',
    'features.page.orders': 'استقبال الطلبات في لوحة التحكم غير مشمول في باقتك.',
    'features.page.tables': 'الطلب من الطاولات غير مشمول في باقتك. ستجد رمز QR الخاص بالمنيو في الإعدادات > رمز QR للمطعم.',
    'error.FEATURE_NOT_AVAILABLE': 'هذه الميزة غير مشمولة في باقتك.',
  },
});
