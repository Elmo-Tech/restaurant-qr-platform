import { defineMessages } from './define';

/** FT-12: Restaurant Settings -- Branch management (list, create, edit, activate / deactivate). */
export const branchesMessages = defineMessages({
  en: {
    'settings.tab.profile': 'Profile',
    'settings.tab.branches': 'Branches',

    'branches.guard.noPermission': "You do not have permission to view this Restaurant's Branches.",
    'branches.heading': 'Branches',
    'branches.description': 'The locations this restaurant operates. Branches are never deleted -- only deactivated.',
    'branches.loading': 'Loading branches…',
    'branches.new': 'New branch',
    'branches.viewOnly': 'You have view-only access to Branches.',
    'branches.createNeedsFullScope': 'Creating a branch requires access to all branches.',
    'branches.empty.title': 'No branches yet',
    'branches.empty.description': 'Create your first branch to start taking orders.',
    'branches.noPhone': 'No phone',
    'branches.noAddress': 'No address',

    'branches.action.edit': 'Edit',
    'branches.action.activate': 'Activate',
    'branches.action.deactivate': 'Deactivate',

    'branches.form.createTitle': 'New branch',
    'branches.form.editTitle': 'Edit branch',
    'branches.form.createSubmit': 'Create branch',
    'branches.form.editSubmit': 'Save changes',
    'branches.form.name': 'Branch name',
    'branches.form.timezone': 'Time zone',
    'branches.form.timezoneHint': 'An IANA time zone, e.g. Africa/Cairo. It controls order times and the dashboard day.',
    'branches.form.phone': 'Phone',
    'branches.form.address': 'Address',
    'branches.form.createNote': 'A new branch starts inactive. Activate it when it is ready to take orders.',
    'branches.form.error.nameRequired': 'Enter the branch name.',
    'branches.form.error.timezoneRequired': 'Enter the branch time zone.',
    'branches.form.error.timezoneInvalid': 'Enter a valid time zone, for example Africa/Cairo.',

    'branches.create.success': 'Branch "{name}" was created.',
    'branches.edit.success': 'Branch "{name}" was updated.',
    'branches.activate.success': 'Branch "{name}" is now active.',
    'branches.deactivate.success': 'Branch "{name}" is now inactive.',

    'branches.deactivate.title': 'Deactivate "{name}"?',
    'branches.deactivate.description':
      'The branch stops taking new orders and is hidden from guests. Its existing orders, tables, delivery areas and staff access are kept exactly as they are, and you can activate it again at any time.',
    'branches.deactivate.confirm': 'Deactivate branch',
  },
  ar: {
    'settings.tab.profile': 'الملف التعريفي',
    'settings.tab.branches': 'الفروع',

    'branches.guard.noPermission': 'ليست لديك صلاحية عرض فروع هذا المطعم.',
    'branches.heading': 'الفروع',
    'branches.description': 'المواقع التي يعمل بها هذا المطعم. لا تُحذف الفروع أبدًا -- بل يمكن تعطيلها فقط.',
    'branches.loading': 'جارٍ تحميل الفروع…',
    'branches.new': 'فرع جديد',
    'branches.viewOnly': 'لديك صلاحية عرض فقط للفروع.',
    'branches.createNeedsFullScope': 'إنشاء فرع يتطلب الوصول إلى كل الفروع.',
    'branches.empty.title': 'لا توجد فروع بعد',
    'branches.empty.description': 'أنشئ أول فرع لبدء استقبال الطلبات.',
    'branches.noPhone': 'لا يوجد هاتف',
    'branches.noAddress': 'لا يوجد عنوان',

    'branches.action.edit': 'تعديل',
    'branches.action.activate': 'تفعيل',
    'branches.action.deactivate': 'تعطيل',

    'branches.form.createTitle': 'فرع جديد',
    'branches.form.editTitle': 'تعديل الفرع',
    'branches.form.createSubmit': 'إنشاء الفرع',
    'branches.form.editSubmit': 'حفظ التغييرات',
    'branches.form.name': 'اسم الفرع',
    'branches.form.timezone': 'المنطقة الزمنية',
    'branches.form.timezoneHint': 'منطقة زمنية بصيغة IANA، مثل Africa/Cairo. تحدد أوقات الطلبات ويوم لوحة التحكم.',
    'branches.form.phone': 'الهاتف',
    'branches.form.address': 'العنوان',
    'branches.form.createNote': 'يبدأ الفرع الجديد معطّلًا. فعّله عندما يصبح جاهزًا لاستقبال الطلبات.',
    'branches.form.error.nameRequired': 'أدخل اسم الفرع.',
    'branches.form.error.timezoneRequired': 'أدخل المنطقة الزمنية للفرع.',
    'branches.form.error.timezoneInvalid': 'أدخل منطقة زمنية صالحة، مثل Africa/Cairo.',

    'branches.create.success': 'تم إنشاء الفرع "{name}".',
    'branches.edit.success': 'تم تحديث الفرع "{name}".',
    'branches.activate.success': 'الفرع "{name}" مفعّل الآن.',
    'branches.deactivate.success': 'الفرع "{name}" معطّل الآن.',

    'branches.deactivate.title': 'تعطيل "{name}"؟',
    'branches.deactivate.description':
      'يتوقف الفرع عن استقبال الطلبات الجديدة ويُخفى عن الضيوف. تبقى طلباته وطاولاته ومناطق التوصيل وصلاحيات الموظفين كما هي تمامًا، ويمكنك تفعيله مرة أخرى في أي وقت.',
    'branches.deactivate.confirm': 'تعطيل الفرع',
  },
});
