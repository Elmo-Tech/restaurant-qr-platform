import { defineMessages } from './define';

/** FT-10A: the Restaurant-wide Modifier Library (presets). */
export const presetsMessages = defineMessages({
  en: {
    'presets.title': 'Modifier Library',
    'presets.subtitle':
      'Reusable Modifier Group templates (e.g. "Standard Size") Staff can attach to many Products from each Product\'s Modifiers section. Editing a preset here updates every Product using it, except a price a Product has overridden for itself.',
    'presets.needsFullScope': 'Full Restaurant branch scope is required to manage Modifier Presets.',
    'presets.loading': 'Loading modifier presets…',
    'presets.none': 'No presets yet.',
    'presets.inactiveSuffix': ' (inactive)',
    'presets.new': '+ New Preset',
    'presets.selectHint': 'Select a preset, or create a new one.',
    'presets.newTitle': 'New Preset',
    'presets.create': 'Create Preset',
    'presets.confirmDelete': 'Delete "{name}" from the Modifier Library? This cannot be undone.',
    'presets.options': 'Options',
  },
  ar: {
    'presets.title': 'مكتبة الإضافات',
    'presets.subtitle':
      'قوالب مجموعات إضافات قابلة لإعادة الاستخدام (مثل "الحجم القياسي") يمكن للموظفين ربطها بعدة منتجات من قسم الإضافات في كل منتج. تعديل القالب هنا يحدّث كل منتج يستخدمه، باستثناء السعر الذي خصّصه المنتج لنفسه.',
    'presets.needsFullScope': 'إدارة قوالب الإضافات تتطلب صلاحية على جميع فروع المطعم.',
    'presets.loading': 'جارٍ تحميل قوالب الإضافات…',
    'presets.none': 'لا توجد قوالب بعد.',
    'presets.inactiveSuffix': ' (غير مفعّل)',
    'presets.new': '+ قالب جديد',
    'presets.selectHint': 'اختر قالبًا، أو أنشئ قالبًا جديدًا.',
    'presets.newTitle': 'قالب جديد',
    'presets.create': 'إنشاء القالب',
    'presets.confirmDelete': 'حذف "{name}" من مكتبة الإضافات؟ لا يمكن التراجع عن هذا الإجراء.',
    'presets.options': 'الخيارات',
  },
});
